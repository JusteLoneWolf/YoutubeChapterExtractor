const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const winston = require('winston');
const ProgressBar = require('progress');
const path = require('path');
const readline = require('readline');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({message }) => `[YoutubeChapterExtractor] : ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
    ]
});

const fileExists = (filePath) => {
    return new Promise((resolve) => {
        fs.access(filePath, fs.constants.F_OK, (err) => {
            resolve(!err);
        });
    });
};
const extractChapter = (videoFile, chapter, index, outputDir) => {
    return new Promise(async (resolve, reject) => {
        const startTime = chapter.start_time;
        const endTime = chapter.end_time;
        const title = chapter.title;
        const outputFile = path.join(outputDir, `${title.replace(' - ','')}.mp3`);
        const exists = await fileExists(outputFile);
        if (exists) {
            console.log(`Le fichier de sortie ${outputFile.split('\\')[2]} existe déjà.`);
            resolve();
        }else {
            const extractBar = new ProgressBar(`Extraction du chapitre ${index + 1} [:bar] :percent :etas\n`, {
                complete: '=',
                incomplete: ' ',
                width: 40,
                total: 100
            });

            ffmpeg(videoFile)
                .setStartTime(startTime)
                .setDuration(endTime - startTime)
                .audioCodec('libmp3lame')
                .audioBitrate('192k')
                .toFormat('mp3')
                .on('progress', (progress) => {
                    extractBar.update(progress.percent / 100);
                })
                .on('end', () => {
                    logger.info(`Chapitre ${index + 1} (${title}) extrait avec succès`);
                    resolve();
                })
                .on('error', (err) => {
                    logger.error(`Erreur lors de l'extraction du chapitre ${index + 1} : ${err.message}`);
                    reject(err);
                })
                .output(outputFile)
                .run();
        }
    });
};
const extractFullAudio = (videoFile, outputFile) => {
    return new Promise((resolve, reject) => {
        const extractBar = new ProgressBar('Extraction de l\'audio complet [:bar] :percent :etas\n', {
            complete: '=',
            incomplete: ' ',
            width: 40,
            total: 100
        });

        ffmpeg(videoFile)
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .toFormat('mp3')
            .on('progress', (progress) => {
                extractBar.update(progress.percent / 100);
            })
            .on('end', () => {
                logger.info(`Audio complet extrait avec succès`);
                resolve();
            })
            .on('error', (err) => {
                logger.error(`Erreur lors de l'extraction de l'audio complet : ${err.message}`);
                reject(err);
            })
            .output(outputFile)
            .run();
    });
};

const processVideo = async (videoUrl) => {

    try {
        logger.info(`Démarrage du téléchargement de la vidéo depuis : ${videoUrl}`);
        const output = await youtubedl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:googlebot'
            ]
        });
        const outputDir = path.join('./output', `${output.title}`);
        if (!fs.existsSync(outputDir)){
            fs.mkdirSync(outputDir, { recursive: true });
            logger.info(`Création du répertoire de sortie : ${outputDir}`);
        }
        const videoId = output.id;
        const videoFile = path.join(outputDir, `${output.title}.webm`);
        logger.info(`Informations de la vidéo récupérées, ID: ${videoId}`);

        const downloadBar = new ProgressBar('Téléchargement [:bar] :percent :etas', {
            complete: '=',
            incomplete: ' ',
            width: 40,
            total: 100
        });

        await new Promise((resolve, reject) => {
            youtubedl(videoUrl, {
                output: videoFile,
                format: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
                progress: (progress) => {
                    downloadBar.update(progress.percent / 100);
                }
            }).then(resolve).catch(reject);
        });

        logger.info(`Vidéo téléchargée en tant que : ${videoFile}`);

        const chapters = output.chapters;
        const fullAudioFile = path.join(outputDir, `${output.title}.mp3`);
        logger.info(`Extraction de l'audio complet.`);
        await extractFullAudio(videoFile, fullAudioFile);
        if (chapters && chapters.length > 0) {
            logger.info(`Nombre de chapitres à extraire : ${chapters.length}`);
            for (let i = 0; i < chapters.length; i++) {
                await extractChapter(videoFile, chapters[i], i, outputDir);
            }
        }
    } catch (err) {
        logger.error(`Erreur lors du traitement de la vidéo : ${err.message}`);
        console.log(err)
    }
};

const promptUser = async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Voulez-vous extraire une autre vidéo ? (oui/non) : ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'oui');
        });
    });
};

const main = async () => {
    let continueProcessing = true;

    while (continueProcessing) {
        const videoUrl = await new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question('Entrez l\'URL de la vidéo YouTube : ', (url) => {
                rl.close();
                resolve(url);
            });
        });

        await processVideo(videoUrl);
        continueProcessing = await promptUser();
    }

    logger.info('Processus terminé.');
};

main();

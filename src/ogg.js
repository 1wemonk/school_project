import ffmpeg from 'fluent-ffmpeg';
import installer from '@ffmpeg-installer/ffmpeg';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class OggConverter {
    constructor() {
        ffmpeg.setFfmpegPath(installer.path);
    }

    toMp3(input, output) {
        try {
            const outputPath = resolve(dirname(input), `${output}.mp3`);
            return new Promise((resolve, reject) => {
                ffmpeg(input)
                    .toFormat('mp3')
                    .output(outputPath)
                    .on('end', () => resolve(outputPath))
                    .on('error', (err) => reject(err.message))
                    .run();
            });
        } catch (e) {
            console.error('Ошибка при конвертации в mp3:', e.message);
        }
    }

    async create(url, filename) {
        try {
            const oggPath = resolve(__dirname, '../voices', `${filename}.ogg`);
            const response = await axios({
                method: 'get',
                url,
                responseType: 'stream',
            });

            return new Promise((resolve) => {
                const stream = createWriteStream(oggPath);
                response.data.pipe(stream);
                stream.on('finish', () => resolve(oggPath));
            });
        } catch (e) {
            console.error('Ошибка при загрузке ogg:', e.message);
        }
    }
}

export const ogg = new OggConverter();
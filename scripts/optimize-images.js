import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const directory = '/Users/akshit2434/github/Front-end/public/products-preview';

async function optimize() {
    const files = fs.readdirSync(directory);

    for (const file of files) {
        if (file.toLowerCase().endsWith('.png')) {
            const inputPath = path.join(directory, file);
            const outputName = file.toLowerCase().replace('.png', '.webp');
            const outputPath = path.join(directory, outputName);

            console.log(`Converting ${file} to ${outputName}...`);

            try {
                await sharp(inputPath)
                    .webp({ quality: 80 })
                    .toFile(outputPath);

                console.log(`Success! Deleting ${file}...`);
                fs.unlinkSync(inputPath);
            } catch (err) {
                console.error(`Error converting ${file}:`, err);
            }
        }
    }
}

optimize();

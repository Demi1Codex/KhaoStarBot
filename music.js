const fs = require('fs');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { EmbedBuilder } = require('discord.js');

if (process.env.YOUTUBE_COOKIES) {
    const decoded = Buffer.from(process.env.YOUTUBE_COOKIES, 'base64').toString('utf8');
    fs.writeFileSync('./cookies.txt', decoded);
    console.log('🍪 cookies.txt creado desde variable de entorno');
}

function parseCookies(filePath) {
    if (!fs.existsSync(filePath)) return undefined;
    const raw = fs.readFileSync(filePath, 'utf8');
    const cookies = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split('\t');
        if (parts.length >= 7) {
            cookies.push({ name: parts[5], value: parts[6] });
        }
    }
    return cookies.length ? cookies : undefined;
}

function setupMusic(client) {
    const cookieOpts = parseCookies('./cookies.txt');
    const youtubePlugin = new YouTubePlugin(
        cookieOpts ? { cookies: cookieOpts } : undefined
    );
    const distube = new DisTube(client, {
        plugins: [youtubePlugin],
        emitNewSongOnly: true,
        savePreviousSongs: true,
        joinNewVoiceChannel: true,
        nsfw: false,
    });

    distube.on('playSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setColor(0xb43cff)
            .setTitle('▶️ Reproduciendo ahora')
            .setDescription(`[${song.name}](${song.url})`)
            .addFields(
                { name: 'Duración', value: song.formattedDuration || 'Live', inline: true },
                { name: 'Solicitado por', value: song.user?.tag || 'Desconocido', inline: true }
            )
            .setThumbnail(song.thumbnail || null)
            .setFooter({ text: '✦ En constante actualización ✦' })
            .setTimestamp();

        if (queue.textChannel) {
            queue.textChannel.send({ embeds: [embed] });
        }
    });

    distube.on('addSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setColor(0x00c896)
            .setTitle('✅ Añadida a la cola')
            .setDescription(`[${song.name}](${song.url})`)
            .addFields(
                { name: 'Duración', value: song.formattedDuration || 'Live', inline: true },
                { name: 'Posición', value: `#${queue.songs.length - 1}`, inline: true },
                { name: 'Solicitado por', value: song.user?.tag || 'Desconocido', inline: true }
            )
            .setThumbnail(song.thumbnail || null)
            .setFooter({ text: '✦ En constante actualización ✦' })
            .setTimestamp();

        if (queue.textChannel) {
            queue.textChannel.send({ embeds: [embed] });
        }
    });

    distube.on('finishSong', (queue, song) => {
        if (queue.textChannel) {
            queue.textChannel.send(`⏹️ Terminó: **${song.name}**`);
        }
    });

    distube.on('empty', (queue) => {
        if (queue.textChannel) {
            queue.textChannel.send('📪 El canal de voz está vacío. Me desconecto.');
        }
    });

    distube.on('disconnect', (queue) => {
        if (queue.textChannel) {
            queue.textChannel.send('👋 Me he desconectado del canal de voz.');
        }
    });

    distube.on('error', (error, queue, song) => {
        console.error('❌ Error en DisTube:', error.message);
        if (queue?.textChannel) {
            queue.textChannel.send(`❌ Ocurrió un error: \`${error.message}\``);
        }
    });

    distube.on('initQueue', (queue) => {
        queue.volume = 50;
    });

    return distube;
}

module.exports = { setupMusic };

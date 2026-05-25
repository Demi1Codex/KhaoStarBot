require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

// ==========================================
// PREVENCIÓN DE CRASHES (Evita que el bot se apague)
// ==========================================
process.on('unhandledRejection', (reason, p) => {
    console.log(' [Anti-Crash] :: Promesa rechazada no manejada:', reason);
});
process.on('uncaughtException', (err, origin) => {
    console.log(' [Anti-Crash] :: Excepción no capturada:', err);
});
process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.log(' [Anti-Crash] :: Monitor de Excepción:', err);
});

// ==========================================
// SERVIDOR FALSO PARA RENDER (Evita el Error de Puerto)
// ==========================================
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('¡Bot de K卄ⒶØS 𝐒𝐓𝐀𝐑 ★ activo y funcionando!'));
app.listen(port, () => console.log(`🌍 Servidor web encendido en el puerto ${port}`));

// Crear una instancia del cliente con los Intents necesarios
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Necesario para detectar entradas al servidor (Raid)
    ]
});

// ==========================================
// CONFIGURACIÓN Y VARIABLES ANTI-RAID
// ==========================================
const messageCount = new Map(); // Para rastrear mensajes por usuario (Anti-Spam)
const joinCount = []; // Para rastrear entradas recientes (Anti-Mass-Join)
const lockedChannels = new Map(); // Para rastrear canales bloqueados por spam (canalId => userId)

const LIMIT_MESSAGES = 5;       // Máximo de mensajes permitidos
const TIME_MESSAGES = 5000;     // En un periodo de 5 segundos
const LIMIT_JOINS = 4;          // Usuarios que pueden unirse antes de activar alerta
const TIME_JOINS = 10000;       // En un lapso de 10 segundos

client.once('ready', () => {
    console.log(`🛡️ ¡Bot de Defensa y Moderación listo como ${client.user.tag}!`);

    // ==========================================
    // SEÑAL PREVENTIVA (Mantener activo en Render)
    // ==========================================
    setInterval(() => {
        console.log(`[Señal Preventiva] El bot sigue activo. Alojado en servidor Render.`);
        
        // Auto-ping a la URL de Render para evitar que el proceso entre en suspensión (Free Tier)
        const serverUrl = process.env.RENDER_EXTERNAL_URL || process.env.PING_URL;
        if (serverUrl) {
            fetch(serverUrl)
                .then(() => console.log(`📡 Señal de auto-ping enviada con éxito a: ${serverUrl}`))
                .catch(err => console.error(`⚠️ Error al enviar auto-ping a ${serverUrl}:`, err.message));
        }
    }, 2 * 60 * 1000); // Se ejecuta cada 2 minutos (120,000 ms)
});

// ==========================================
// SISTEMA ANTI-RAID (Entrada masiva de bots/usuarios)
// ==========================================
client.on('guildMemberAdd', async (member) => {
    const now = Date.now();
    joinCount.push({ id: member.id, time: now });

    // Filtrar los usuarios que entraron en los últimos TIME_JOINS milisegundos
    const recentJoins = joinCount.filter(j => now - j.time < TIME_JOINS);

    // Si la cantidad de usuarios unidos recientemente supera el límite, consideramos que es un Raid
    if (recentJoins.length >= LIMIT_JOINS) {
        console.log('🚨 ¡Alerta de Raid! Expulsando cuentas recientes...');
        
        for (const join of recentJoins) {
            try {
                const raidMember = await member.guild.members.fetch(join.id);
                if (raidMember && raidMember.kickable) {
                    await raidMember.kick('Sistema Automático: Posible Raid / Entrada masiva detectada');
                }
            } catch (err) {
                console.error(`Error al expulsar la cuenta de raid ${join.id}: ${err.message}`);
            }
        }
        // Limpiar el registro para evitar bucles infinitos
        joinCount.length = 0; 
    }
});

// ==========================================
// SISTEMAS DE MENSAJES: MODERACIÓN, ANTI-SPAM Y ANTI-LINKS
// ==========================================
client.on('messageCreate', async (message) => {
    // Ignorar mensajes de otros bots o mensajes por MD
    if (message.author.bot || !message.guild) return;

    const memberHasModPermissions = message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    // --- 1. SISTEMA ANTI-LINKS E INVITACIONES ---
    if (!memberHasModPermissions) {
        const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/i;
        if (inviteRegex.test(message.content)) {
            await message.delete().catch(() => {});
            const aviso = await message.channel.send(`⚠️ ${message.author}, ¡no tienes permitido enviar invitaciones de otros servidores!`);
            setTimeout(() => aviso.delete().catch(() => {}), 5000); // Borra el aviso a los 5s
            return;
        }
    }

    // --- 2. SISTEMA ANTI-SPAM ---
    if (!memberHasModPermissions) {
        const authorId = message.author.id;
        
        if (!messageCount.has(authorId)) {
            messageCount.set(authorId, { count: 1, timer: null });
            
            const timer = setTimeout(() => {
                messageCount.delete(authorId);
            }, TIME_MESSAGES);
            
            messageCount.get(authorId).timer = timer;
        } else {
            const userData = messageCount.get(authorId);
            userData.count += 1;

            if (userData.count >= LIMIT_MESSAGES) {
                // Aplicar timeout por hacer spam (ej. silenciar 5 minutos)
                await message.delete().catch(() => {});
                try {
                    await message.member.timeout(5 * 60 * 1000, 'Sistema Anti-Spam: Enviar mensajes demasiado rápido');
                } catch (err) {
                    console.log(`No pude silenciar a ${message.author.tag}. Revisa la jerarquía de roles del bot.`);
                }
                
                // MODO DE EMERGENCIA: BLOQUEAR CANAL
                try {
                    // Quitar permiso de enviar mensajes a @everyone en este canal
                    await message.channel.permissionOverwrites.edit(message.guild.id, {
                        SendMessages: false
                    });
                    
                    // Guardar en el registro quién bloqueó qué canal
                    lockedChannels.set(message.channel.id, message.author.id);
                    
                    message.channel.send(`🚨 **ALERTA: CANAL BLOQUEADO POR SPAM** 🚨\nCanal bloqueado temporalmente debido a la actividad masiva de ${message.author}.\n\n*El chat se reactivará automáticamente si el usuario abandona el servidor, o si un moderador usa el comando \`!desbloquear\`.*`);
                } catch (err) {
                    console.error("No pude bloquear el canal. Asegúrate de que el bot tenga permisos de 'Gestionar Canales'.");
                }
                
                messageCount.delete(authorId);
                return;
            }
        }
    }

    // --- 3. COMANDOS BÁSICOS DE MODERACIÓN ---
    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Comando !kaoscontrol (Limpia mensajes de un canal)
    if (command === 'kaoscontrol') {
        const rolesPermitidos = ['Ⓐ𝐝𝐦𝐢𝐧 Ðᴇʟ Ҝ卄ⒶØ§ ★', '⛌ ⛌ ⛌ M e i n D e u s ⛌ ⛌ ⛌'];
        const tieneRolPermitido = message.member.roles.cache.some(role => rolesPermitidos.includes(role.name));
        const esAdministrador = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (!tieneRolPermitido && !esAdministrador) {
            return message.reply('❌ Solo los rangos más altos (como Ⓐ𝐝𝐦𝐢𝐧 Ðᴇʟ Ҝ卄ⒶØ§ ★ o ⛌ ⛌ ⛌ M e i n D e u s ⛌ ⛌ ⛌) pueden usar este comando.');
        }
        
        let targetUser = message.mentions.users.first();
        let amount = parseInt(args[0]);

        // Si el primer argumento es una mención, el número será el segundo argumento
        if (targetUser && args[1]) {
            amount = parseInt(args[1]);
        }

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('⚠️ Debes especificar un número entre 1 y 100. Ejemplo: `!kaoscontrol 10` o `!kaoscontrol @usuario 10`');
        }

        try {
            if (targetUser) {
                // Descargar últimos 100 mensajes y filtrar los del usuario mencionado
                const fetched = await message.channel.messages.fetch({ limit: 100 });
                const userMessages = fetched.filter(m => m.author.id === targetUser.id);
                const messagesToDelete = Array.from(userMessages.values()).slice(0, amount);
                
                await message.channel.bulkDelete(messagesToDelete, true);
                const reply = await message.channel.send(`🗑️ He borrado ${messagesToDelete.length} mensajes de ${targetUser.username} exitosamente.`);
                setTimeout(() => reply.delete().catch(() => {}), 3000);
            } else {
                // Borrado general normal
                await message.channel.bulkDelete(amount, true);
                const reply = await message.channel.send(`🗑️ He borrado ${amount} mensajes exitosamente.`);
                setTimeout(() => reply.delete().catch(() => {}), 3000);
            }
        } catch (err) {
            console.error(err);
            message.reply('❌ Hubo un error al intentar eliminar los mensajes. Recuerda que no puedo borrar mensajes de más de 14 días.');
        }
    }

    // Comando !expulsar (Expulsar miembro)
    if (command === 'expulsar') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ No tienes permiso para expulsar.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Por favor, menciona al usuario que deseas expulsar.');
        if (!target.kickable) return message.reply('❌ No puedo expulsar a este usuario. Revisa mi jerarquía de roles.');
        
        await target.kick(`Expulsado por ${message.author.tag}`).catch(() => {});
        message.reply(`✅ ${target.user.tag} fue expulsado del servidor.`);
    }

    // Comando !banear (Banear miembro)
    if (command === 'banear') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ No tienes permiso para banear.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Por favor, menciona al usuario que deseas banear.');
        if (!target.bannable) return message.reply('❌ No puedo banear a este usuario. Revisa mi jerarquía de roles.');
        
        await target.ban({ reason: `Baneado por ${message.author.tag}` }).catch(() => {});
        message.reply(`🔨 ${target.user.tag} fue baneado del servidor.`);
    }

    // Comando !desbloquear (Desbloquear canal tras ataque de spam)
    if (command === 'desbloquear') {
        // Se requiere permiso de Gestionar Canales o Administrador
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ No tienes permiso para gestionar canales.');
        
        await message.channel.permissionOverwrites.edit(message.guild.id, {
            SendMessages: null // Restaura el permiso original del rol @everyone
        }).catch(() => {});
        
        lockedChannels.delete(message.channel.id);
        message.reply('🔓 **El canal ha sido desbloqueado por un moderador.** Ya pueden volver a hablar.');
    }
});

// ==========================================
// DESBLOQUEO AUTOMÁTICO SI EL SPAMMER SALE
// ==========================================
client.on('guildMemberRemove', async (member) => {
    // Revisar si este usuario causó el bloqueo de algún canal
    for (const [channelId, spammerId] of lockedChannels.entries()) {
        if (spammerId === member.id) {
            const channel = member.guild.channels.cache.get(channelId);
            if (channel) {
                // Desbloquear el canal
                await channel.permissionOverwrites.edit(member.guild.id, {
                    SendMessages: null
                }).catch(() => {});
                
                channel.send(`🔓 **CANAL DESBLOQUEADO AUTOMÁTICAMENTE**\nEl usuario problemático que causó el spam ha abandonado el servidor. Se restaura la comunicación.`);
                lockedChannels.delete(channelId);
            }
        }
    }
});

// Conectar el bot usando tu Token desde el archivo .env
client.login(process.env.DISCORD_TOKEN);
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

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

const LIMIT_MESSAGES = 5;       // Máximo de mensajes permitidos
const TIME_MESSAGES = 5000;     // En un periodo de 5 segundos
const LIMIT_JOINS = 4;          // Usuarios que pueden unirse antes de activar alerta
const TIME_JOINS = 10000;       // En un lapso de 10 segundos

client.once('ready', () => {
    console.log(`🛡️ ¡Bot de Defensa y Moderación listo como ${client.user.tag}!`);
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
                    message.channel.send(`⛔ ${message.author} ha sido silenciado por 5 minutos debido a comportamiento de Spam.`);
                } catch (err) {
                    console.log(`No pude silenciar a ${message.author.tag}. Revisa la jerarquía de roles del bot.`);
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

    // Comando !clear (Limpia mensajes de un canal)
    if (command === 'clear') {
        if (!memberHasModPermissions) return message.reply('❌ No tienes permiso para gestionar mensajes.');
        
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('⚠️ Debes especificar un número entre 1 y 100.');
        
        await message.channel.bulkDelete(amount, true).catch(err => {
            console.error(err);
            message.reply('❌ Hubo un error al intentar eliminar los mensajes. Recuerda que no puedo borrar mensajes de más de 14 días.');
        });
        
        const reply = await message.channel.send(`🗑️ He borrado ${amount} mensajes exitosamente.`);
        setTimeout(() => reply.delete().catch(() => {}), 3000);
    }

    // Comando !kick (Expulsar miembro)
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ No tienes permiso para expulsar.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Por favor, menciona al usuario que deseas expulsar.');
        if (!target.kickable) return message.reply('❌ No puedo expulsar a este usuario. Revisa mi jerarquía de roles.');
        
        await target.kick(`Expulsado por ${message.author.tag}`).catch(() => {});
        message.reply(`✅ ${target.user.tag} fue expulsado del servidor.`);
    }

    // Comando !ban (Banear miembro)
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ No tienes permiso para banear.');
        const target = message.mentions.members.first();
        if (!target) return message.reply('⚠️ Por favor, menciona al usuario que deseas banear.');
        if (!target.bannable) return message.reply('❌ No puedo banear a este usuario. Revisa mi jerarquía de roles.');
        
        await target.ban({ reason: `Baneado por ${message.author.tag}` }).catch(() => {});
        message.reply(`🔨 ${target.user.tag} fue baneado del servidor.`);
    }
});

// Conectar el bot usando tu Token desde el archivo .env
client.login(process.env.DISCORD_TOKEN);
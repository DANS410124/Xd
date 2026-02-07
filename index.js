const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const config = require("config.json");

/* ======================
      CARGAR DATOS
====================== */
let votos = 0;
let votantes = new Set();

// Cargar puntos.json
try {
  const datos = JSON.parse(fs.readFileSync("./puntos.json", "utf8"));
  votos = datos.votos || 0;
  votantes = new Set(datos.votantes || []);
  console.log("📁 Datos cargados desde puntos.json");
} catch (e) {
  console.log("⚠️ No se pudo leer puntos.json, creando nuevo archivo...");
  guardarDatos();
}

function guardarDatos() {
  fs.writeFileSync(
    "./puntos.json",
    JSON.stringify(
      {
        votos: votos,
        votantes: Array.from(votantes)
      },
      null,
      2
    )
  );
}

const maxVotos = 10;
let mensajeEncuestaId = null;

/* ======================
         CLIENTE
====================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

/* ======================
       BOT LISTO
====================== */
client.once(Events.ClientReady, async () => {
  console.log(`🟢 Conectado como ${client.user.tag}`);

  /* ----------- VERIFICACIÓN ----------- */
  try {
    const canalVerif = await client.channels.fetch(config.canalVerificacion);
    const mensajes = await canalVerif.messages.fetch({ limit: 10 });

    const yaExiste = mensajes.some(
      m => m.author.id === client.user.id && m.components.length > 0
    );

    if (!yaExiste) {
      const embed = new EmbedBuilder()
        .setTitle("🔐 Verificación")
        .setDescription("Presiona el botón para verificarte.")
        .setColor("#f1c40f");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verificar")
          .setLabel("✅ Verificarme")
          .setStyle(ButtonStyle.Success)
      );

      await canalVerif.send({ embeds: [embed], components: [row] });
    }
  } catch (e) {
    console.error("Error verificación:", e);
  }

  /* ----------- ENCUESTA ----------- */
  try {
    const canalEncuesta = await client.channels.fetch(config.canalEncuesta);
    if (!canalEncuesta) return;

    const mensajes = await canalEncuesta.messages.fetch({ limit: 20 });

    const mensajeExistente = mensajes.find(
      m =>
        m.author.id === client.user.id &&
        m.components.length > 0 &&
        m.components[0].components[0].customId === "votar"
    );

    if (mensajeExistente) {
      mensajeEncuestaId = mensajeExistente.id;
      console.log("📊 Encuesta existente encontrada");
      return;
    }

    const embedEncuesta = new EmbedBuilder()
      .setTitle("📊 Encuesta")
      .setDescription(`**${votos}/${maxVotos}**`)
      .setColor("#3498db");

    const rowEncuesta = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("votar")
        .setLabel("🗳️ Votar")
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await canalEncuesta.send({
      embeds: [embedEncuesta],
      components: [rowEncuesta]
    });

    mensajeEncuestaId = msg.id;
    console.log("📊 Encuesta creada");

  } catch (e) {
    console.error("Error encuesta:", e);
  }
});

/* ======================
   USUARIO NUEVO
====================== */
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await member.roles.add(config.rolNoVerificado);
  } catch (err) {
    console.error(err);
  }
});

/* ======================
     INTERACCIONES
====================== */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  /* ----------- VERIFICAR ----------- */
  if (interaction.customId === "verificar") {
    try {
      await interaction.member.roles.remove(config.rolNoVerificado);
      await interaction.member.roles.add(config.rolVerificado);

      return interaction.reply({
        content: "✅ Verificación completada.",
        ephemeral: true
      });
    } catch (e) {
      return interaction.reply({
        content: "❌ Error al verificar.",
        ephemeral: true
      });
    }
  }

  /* ----------- ENCUESTA ----------- */
  if (interaction.customId === "votar") {
    const userId = interaction.user.id;

    if (votantes.has(userId)) {
      return interaction.reply({
        content: "⚠️ Ya votaste en esta encuesta.",
        ephemeral: true
      });
    }

    if (votos >= maxVotos) {
      return interaction.reply({
        content: "❌ La encuesta ya se completó.",
        ephemeral: true
      });
    }

    votantes.add(userId);
    votos++;
    guardarDatos(); // <-- GUARDAR AL VOTAR

    try {
      const canal = interaction.channel;
      const mensaje = await canal.messages.fetch(mensajeEncuestaId);

      const embedActualizado = new EmbedBuilder()
        .setTitle("📊 Encuesta")
        .setDescription(`**${votos}/${maxVotos}**`)
        .setColor("#3498db");

      if (votos >= maxVotos) {
        const rowDesactivado = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("votar")
            .setLabel("🗳️ Votar")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        );

        await mensaje.edit({
          embeds: [embedActualizado],
          components: [rowDesactivado]
        });

        await canal.send("🎉 **¡La encuesta se completó!**");

      } else {
        await mensaje.edit({
          embeds: [embedActualizado]
        });
      }

      await interaction.reply({
        content: "✅ Tu voto fue registrado.",
        ephemeral: true
      });

    } catch (e) {
      console.error(e);
      interaction.reply({
        content: "❌ Error al votar.",
        ephemeral: true
      });
    }
  }
});

client.login(process.env.TOKEN);

import { Resend } from 'resend';
import PDFDocument from 'pdfkit';
import { supabaseAdmin } from "../../supabaseAdminClient.js";

const resend = new Resend(process.env.RESEND_API_KEY);

// Configurar el dominio con customReturnPath (ejecutar una sola vez)
const configurarDominio = async () => {
  try {
    console.log('🔧 Configurando dominio en Resend...');
    
    const result = await resend.domains.create({ 
      name: 'stayaway.com.co', 
      customReturnPath: 'outbound' 
    });

    console.log('✅ Dominio configurado correctamente:');
    console.log('📧 Domain ID:', result.data?.id);
    console.log('🔧 Custom Return Path: outbound');
    
    if (result.data?.records) {
      console.log('📋 Registros DNS a agregar:');
      result.data.records.forEach(record => {
        console.log(`   ${record.type} | ${record.name} | ${record.value}`);
      });
    }
    
    return result;
  } catch (error) {
    // Si el dominio ya existe, no es problema
    if (error.message?.includes('already exists')) {
      console.log('ℹ️ El dominio ya está configurado en Resend');
      return { success: true };
    }
    console.error('❌ Error configurando dominio:', error);
    return { success: false, error };
  }
};

// Ejecutar la configuración al iniciar (solo una vez)
let dominioConfigurado = false;
const inicializarResend = async () => {
  if (!dominioConfigurado) {
    await configurarDominio();
    dominioConfigurado = true;
  }
};

// Inicializar Resend
inicializarResend();
/**
 * 📄 Descargar imagen desde URL (para plantilla del boleto)
 */
const descargarImagen = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error descargando imagen: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

/**
 * 📄 Generar PDF de boletos oficiales Coljuegos
 * Cada número se renderiza como un boleto completo con todos los campos legales
 */
const generarPDFBoletos = async (usuario, rifa, numerosUsuario) => {
  return new Promise(async (resolve, reject) => {
    try {
      const CM = 28.35;

      const BOLETO_W   = 11 * CM;
      const BOLETO_H   = 5  * CM;
      const GAP        = 0.5 * CM;

      const PAGE_W     = 595;
      const PAGE_H     = 842;
      const MARGIN_X   = (PAGE_W - BOLETO_W) / 2;
      const MARGIN_Y   = 0.8 * CM;

      const POR_PAGINA = Math.floor((PAGE_H - MARGIN_Y * 2) / (BOLETO_H + GAP));

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        autoFirstPage: false,
        compress: true,      // ✅ PDF más pequeño
        bufferPages: false   // ✅ streaming, no acumula en RAM
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ✅ Descargar imagen UNA sola vez
      let imagenPlantilla = null;
      if (rifa.imagen_boleta_url) {
        console.log('🖼️ Descargando imagen plantilla...');
        try {
          imagenPlantilla = await descargarImagen(rifa.imagen_boleta_url);
          console.log('✅ Imagen plantilla lista');
        } catch (imgError) {
          console.warn('⚠️ No se pudo descargar imagen plantilla:', imgError.message);
        }
      }

      // ✅ Pre-calcular strings estáticos (fuera del loop)
      const fechaSorteoStr = rifa.fecha_sorteo
        ? new Date(rifa.fecha_sorteo).toLocaleDateString('es-CO', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota'
          })
        : 'Por confirmar';

      const fechaAutorizacion = rifa.fecha_autorizacion
        ? new Date(rifa.fecha_autorizacion).toLocaleDateString('es-CO', {
            year: 'numeric', month: 'long', day: 'numeric'
          })
        : 'Por confirmar';

      const digitosFormato  = (rifa.cantidad_numeros - 1).toString().length;
      const formatNum       = (n) => n.toString().padStart(digitosFormato, '0');

      const strValor        = `$${(rifa.precio_unitario || 0).toLocaleString('es-CO')} COP`;
      const strLoteria      = rifa.loteria_referencia    || '—';
      const strCaducidad    = rifa.termino_caducidad     || '30 días hábiles';
      const strActoAdmin    = `Res. N° ${rifa.numero_resolucion || '___'}  Fecha: ${fechaAutorizacion}`;
      const strComprador    = `${usuario.nombres} ${usuario.apellidos}  |  ${usuario.tipo_documento || 'CC'} ${usuario.numero_documento}`;
      const strPie          = `Responsable: ${rifa.responsable_nombre || 'StayAway S.A.S.'}${rifa.responsable_id ? ' | ' + rifa.responsable_id : ''}${rifa.responsable_domicilio ? ' — ' + rifa.responsable_domicilio : ''}`;

      // ✅ Zonas internas
      const NUM_ZONE_W  = 1.4 * CM;
      const SEP         = 0.25 * CM;
      const DATA_X      = MARGIN_X + NUM_ZONE_W + SEP;
      const DATA_W      = 4.2 * CM;
      const RIGHT_X     = DATA_X + DATA_W + (0.15 * CM);
      const RIGHT_W     = BOLETO_W - NUM_ZONE_W - SEP - DATA_W - (0.15 * CM) - (0.35 * CM);

      const NEGRO       = '#111111';
      const GRIS_LABEL  = '#666666';
      const F_LABEL     = 4.8;
      const F_VALUE     = 6.2;
      const F_NUM       = 28;
      const F_TITULO    = 11;
      const F_PIE       = 4.5;
      const FIELD_H_1   = 0.62 * CM;
      const FIELD_H_2   = 0.90 * CM;

      // ✅ Posiciones Y relativas al bY del boleto (pre-calculadas)
      const PAD_TOP = 0.12 * CM;
      const posY = [
        PAD_TOP,
        PAD_TOP + FIELD_H_1,
        PAD_TOP + FIELD_H_1 + FIELD_H_2,
        PAD_TOP + FIELD_H_1 * 2 + FIELD_H_2,
        PAD_TOP + FIELD_H_1 * 3 + FIELD_H_2,
        PAD_TOP + FIELD_H_1 * 3 + FIELD_H_2 * 2,
      ];

      const dibujarCampo = (label, valor, x, y, w, largo = false) => {
        doc.fontSize(F_LABEL).fillColor(GRIS_LABEL).font('Helvetica-Bold')
           .text(label, x, y, { width: w, lineBreak: false });
        doc.fontSize(F_VALUE).fillColor(NEGRO).font('Helvetica-Bold')
           .text(valor, x, y + (F_LABEL + 1.5), {
             width: w,
             lineBreak: largo,
             ...(largo && { height: F_VALUE * 2 + 4 })
           });
      };

      let boletoIndex = 0;

      for (const numero of numerosUsuario) {

        if (boletoIndex % POR_PAGINA === 0) doc.addPage();

        const posEnPagina = boletoIndex % POR_PAGINA;
        const bX = MARGIN_X;
        const bY = MARGIN_Y + posEnPagina * (BOLETO_H + GAP);

        // ── Fondo / plantilla
        if (imagenPlantilla) {
          doc.image(imagenPlantilla, bX, bY, { width: BOLETO_W, height: BOLETO_H });
        } else {
          doc.rect(bX, bY, BOLETO_W, BOLETO_H)
             .fillAndStroke('#ffffff', NEGRO).lineWidth(1)
             .dash(3, { space: 2 });
          doc.undash();
        }

        // ── Número rotado −90°
        doc.save();
        doc.translate(bX + NUM_ZONE_W / 2, bY + BOLETO_H / 2);
        doc.rotate(-90);
        doc.fontSize(F_NUM).fillColor(NEGRO).font('Helvetica-Bold')
           .text(formatNum(numero), -(BOLETO_H / 2), -F_NUM / 2, {
             width: BOLETO_H, align: 'center', lineBreak: false
           });
        doc.restore();

        // ── Campos legales
        dibujarCampo('VALOR VENTA AL PÚBLICO:',              strValor,       DATA_X, bY + posY[0], DATA_W, false);
        dibujarCampo('LUGAR, HORA Y FECHA DEL SORTEO:',      fechaSorteoStr, DATA_X, bY + posY[1], DATA_W, true);
        dibujarCampo('LOTERÍA DE REFERENCIA:',               strLoteria,     DATA_X, bY + posY[2], DATA_W, false);
        dibujarCampo('TÉRMINO DE CADUCIDAD DEL PREMIO:',     strCaducidad,   DATA_X, bY + posY[3], DATA_W, false);
        dibujarCampo('ACTO ADMINISTRATIVO DE AUTORIZACIÓN:', strActoAdmin,   DATA_X, bY + posY[4], DATA_W, true);
        dibujarCampo('COMPRADOR:',                           strComprador,   DATA_X, bY + posY[5], DATA_W, false);

        // ── Pie: responsable legal
        doc.fontSize(F_PIE).fillColor(GRIS_LABEL).font('Helvetica')
           .text(strPie, DATA_X, bY + BOLETO_H - (0.28 * CM), {
             width: DATA_W, lineBreak: false
           });

        // ── Título columna derecha
        doc.fontSize(F_TITULO).fillColor(NEGRO).font('Helvetica-Bold')
           .text(rifa.titulo, RIGHT_X, bY + (BOLETO_H / 2) - (0.6 * CM), {
             width: RIGHT_W, align: 'center'
           });

        boletoIndex++;
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
};


/**
 * 📧 Enviar correo de compra exitosa con PDF adjunto - CON NÚMEROS GRATIS
 */
export const enviarCorreoCompraExitosa = async (usuario, transaccion, numerosAsignados) => {
  try {
    console.log(`📧 Enviando correo de compra a: ${usuario.correo_electronico}`);
    console.log(`   - Números comprados: ${transaccion.cantidad}`);
    console.log(`   - Números gratis: ${transaccion.numerosGratis || 0}`);
    console.log(`   - Total entregado: ${numerosAsignados.length}`);

    // ✅ Obtener rifa completa con todos los campos nuevos de Coljuegos
    const { data: rifa, error: rifaError } = await supabaseAdmin
      .from('rifas')
      .select(`
        id, titulo, cantidad_numeros, precio_unitario, fecha_sorteo,
        loteria_referencia, descripcion, descripcion_premios, valor_premios,
        numero_resolucion, fecha_autorizacion, termino_caducidad,
        responsable_nombre, responsable_domicilio, responsable_id,
        imagen_boleta_url
      `)
      .eq('id', transaccion.rifa_id)
      .single();

    if (rifaError || !rifa) {
      console.warn('⚠️ No se pudo obtener info completa de la rifa, usando datos básicos');
    }

    const rifaData = rifa || {
      titulo: transaccion.rifaTitulo,
      cantidad_numeros: transaccion.cantidad,
      precio_unitario: transaccion.precio_unitario
    };

    console.log('📄 Generando PDF de boletos oficiales...');
    const pdfBuffer = await generarPDFBoletos(usuario, rifaData, numerosAsignados);
    console.log('✅ PDF generado exitosamente');

    const pdfBase64 = pdfBuffer.toString('base64');
    const htmlContent = generarTemplateCompra(usuario, transaccion, numerosAsignados);

    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: [usuario.correo_electronico],
      subject: `✅ Compra Exitosa - ${transaccion.rifaTitulo}${transaccion.numerosGratis > 0 ? ' 🎁 ¡Con números gratis!' : ''}`,
      html: htmlContent,
      attachments: [
        {
          filename: `StayAway_Boletos_${transaccion.referencia}.pdf`,
          content: pdfBase64,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    });

    if (error) {
      console.error('❌ Error enviando correo de compra:', error);
      throw error;
    }

    console.log('✅ Correo de compra enviado exitosamente:', data.id);
    return data;

  } catch (error) {
    console.error('❌ Error en enviarCorreoCompraExitosa:', error);
    throw error;
  }
};

/**
 * Enviar correo con contraseña a usuario nuevo
 */
export const enviarCorreoBienvenida = async (usuario, passwordPlana) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: usuario.correo_electronico,
      subject: '👋 ¡Bienvenido a StayAway Rifas!',
      html: generarTemplateBienvenida(usuario, passwordPlana),
    });

    if (error) {
      console.error('❌ Error Resend:', error);
      return { success: false, error };
    }

    console.log('✅ Correo de bienvenida enviado:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error enviando correo de bienvenida:', error);
    return { success: false, error };
  }
};

/**
 * Enviar correo de recuperación de contraseña
 */
export const enviarCorreoRecuperacion = async (usuario, tokenRecuperacion) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${tokenRecuperacion}`;
    
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: usuario.correo_electronico,
      subject: '🔐 Restablece tu contraseña - StayAway Rifas',
      html: generarTemplateRecuperacion(usuario, resetUrl),
    });

    if (error) {
      console.error('❌ Error Resend:', error);
      return { success: false, error };
    }

    console.log('✅ Correo de recuperación enviado:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error enviando correo de recuperación:', error);
    return { success: false, error };
  }
};

/**
 * Función para probar la configuración del dominio
 */
export const probarConfiguracionEmail = async () => {
  try {
    console.log('🧪 Probando configuración de email...');
    
    // Probar enviando un correo de prueba
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: 'marcoscastro0958@gmail.com', // Tu email
      subject: '🧪 Prueba de configuración - StayAway Rifas',
      html: '<h1>✅ Configuración de email funcionando correctamente</h1><p>Si recibes este correo, la configuración de Resend está funcionando.</p>',
    });

    if (error) {
      console.error('❌ Error en prueba:', error);
      return { success: false, error };
    }

    console.log('✅ Prueba exitosa, correo enviado:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error en prueba de configuración:', error);
    return { success: false, error };
  }
};

/**
 * 📧 Template HTML para correo de compra exitosa - CON NÚMEROS GRATIS
 */
const generarTemplateCompra = (usuario, transaccion, numerosAsignados) => {
  const tienePaqueteGratis = transaccion.numerosGratis && transaccion.numerosGratis > 0;
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compra Exitosa - StayAway Rifas</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #f7f9fc 0%, #CFDEE7 100%);
      padding: 20px;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(10, 54, 157, 0.18);
    }
    .header {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      font-size: 30px;
      margin-bottom: 10px;
      font-weight: 800;
    }
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .success-icon {
      text-align: center;
      font-size: 72px;
      margin-bottom: 20px;
    }
    .greeting {
      font-size: 22px;
      color: #0A369D;
      margin-bottom: 16px;
      text-align: center;
      font-weight: 800;
    }
    .message {
      font-size: 15px;
      color: #4a4a4a;
      line-height: 1.7;
      margin-bottom: 28px;
      text-align: center;
    }
    .promo-banner {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: white;
      padding: 20px;
      border-radius: 16px;
      margin: 28px 0;
      text-align: center;
      box-shadow: 0 10px 25px rgba(10, 54, 157, 0.35);
    }
    .promo-banner .gift-icon {
      font-size: 44px;
      margin-bottom: 10px;
    }
    .promo-banner h2 {
      font-size: 22px;
      margin-bottom: 8px;
      font-weight: 800;
    }
    .promo-banner p {
      font-size: 16px;
      opacity: 0.95;
    }
    .promo-banner .promo-details {
      background: rgba(255,255,255,0.15);
      padding: 14px;
      border-radius: 10px;
      margin-top: 14px;
      font-size: 15px;
    }
    .transaction-info {
      background: #f5f7fb;
      border-radius: 14px;
      padding: 24px;
      margin: 28px 0;
      border-left: 5px solid #0A369D;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 11px 0;
      border-bottom: 1px solid #CFDEE7;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label {
      font-weight: 600;
      color: #5a6370;
      font-size: 14px;
    }
    .info-value {
      color: #2d2d2d;
      font-weight: 500;
      font-size: 14px;
    }
    .info-value.highlight {
      color: #0A369D;
      font-weight: 800;
      font-size: 16px;
    }
    .info-value.promo {
      color: #4472CA;
      font-weight: 700;
      font-size: 15px;
    }
    .numbers-section { margin: 28px 0; }
    .section-title {
      font-size: 18px;
      color: #0A369D;
      margin-bottom: 10px;
      text-align: center;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .numbers-subtitle {
      text-align: center;
      color: #5a6370;
      font-size: 14px;
      margin-bottom: 14px;
    }
    .numbers-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 14px;
      margin-top: 6px;
    }
    .number-box {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: white;
      padding: 16px 10px;
      border-radius: 10px;
      text-align: center;
      font-weight: 700;
      font-size: 16px;
      box-shadow: 0 4px 12px rgba(10, 54, 157, 0.25);
    }
    .more-numbers-note {
      text-align: center;
      color: #5a6370;
      font-size: 13px;
      margin-top: 12px;
    }
    .attachment-note {
      background: #f0f4ff;
      border: 2px solid #CFDEE7;
      border-radius: 10px;
      padding: 14px;
      margin: 18px 0;
      text-align: center;
      color: #0A369D;
    }
    .attachment-note strong {
      display: block;
      font-size: 15px;
      margin-bottom: 4px;
    }
    .footer {
      background: #0A369D;
      color: #ffffff;
      padding: 28px 30px;
      text-align: center;
      font-size: 13px;
    }
    .footer p { margin: 4px 0; opacity: 0.85; }
    .footer .social-links { margin-top: 16px; }
    .footer .social-links a {
      color: #92B4F4;
      text-decoration: none;
      margin: 0 10px;
      font-weight: 600;
    }
    @media only screen and (max-width: 600px) {
      .header h1 { font-size: 22px; }
      .numbers-grid { grid-template-columns: repeat(5, 1fr); gap: 10px; }
      .number-box { padding: 12px 6px; font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🎉 StayAway Rifas</h1>
      <p>¡Tu compra fue exitosa!</p>
    </div>

    <div class="content">
      <div class="success-icon">✅</div>
      
      <h2 class="greeting">¡Hola, ${usuario.nombres} ${usuario.apellidos}!</h2>
      
      <p class="message">
        Tu compra ha sido procesada exitosamente. ${tienePaqueteGratis ? '¡Y tienes números de regalo!' : 'Ya estás participando en la rifa.'}
        A continuación encontrarás todos los detalles de tu transacción.
      </p>

      ${tienePaqueteGratis ? `
      <div class="promo-banner">
        <div class="gift-icon">🎁</div>
        <h2>¡Felicidades! Obtuviste números GRATIS</h2>
        <p>Por tu compra de ${transaccion.cantidad} números</p>
        <div class="promo-details">
          🎉 Recibiste <strong>+${transaccion.numerosGratis} ${transaccion.numerosGratis === 1 ? 'número' : 'números'} de regalo</strong> 🎉
          <br><br>
          <strong>Total entregado: ${transaccion.cantidadTotal} números</strong>
        </div>
      </div>
      ` : ''}

      <div class="transaction-info">
        <div class="info-row">
          <span class="info-label">Rifa:</span>
          <span class="info-value highlight">${transaccion.rifaTitulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Referencia:</span>
          <span class="info-value">${transaccion.referencia}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Números comprados:</span>
          <span class="info-value">${transaccion.cantidad}</span>
        </div>
        ${tienePaqueteGratis ? `
        <div class="info-row">
          <span class="info-label">🎁 Números GRATIS:</span>
          <span class="info-value promo">+${transaccion.numerosGratis}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📊 Total entregado:</span>
          <span class="info-value highlight">${transaccion.cantidadTotal}</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">Total pagado:</span>
          <span class="info-value highlight">$${transaccion.total.toLocaleString('es-CO')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha:</span>
          <span class="info-value">${new Date().toLocaleDateString('es-CO', { 
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })}</span>
        </div>
      </div>

      <div class="attachment-note">
        <strong>📎 Archivo adjunto:</strong>
        Encuentra el PDF con <strong>todos</strong> tus números en el archivo adjunto de este correo.
      </div>

      <div class="numbers-section">
        <h3 class="section-title">🎯 Tus Números</h3>
        <p class="numbers-subtitle">
          ${tienePaqueteGratis
            ? `Total: <strong>${transaccion.cantidadTotal}</strong> números (${transaccion.cantidad} comprados + ${transaccion.numerosGratis} gratis)`
            : `Total: <strong>${numerosAsignados.length}</strong> números`
          }
        </p>
        <div class="numbers-grid">
          ${numerosAsignados.slice(0, 10).map(n => `<div class="number-box">#${n}</div>`).join('')}
        </div>
        ${numerosAsignados.length > 10 ? `
        <p class="more-numbers-note">
          📎 Y ${numerosAsignados.length - 10} números más — ver todos en el PDF adjunto
        </p>` : ''}
      </div>
    </div>

    <div class="footer">
      <p style="font-weight:800; font-size:15px; opacity:1;">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Contacto: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
      <div class="social-links">
        <a href="#">Instagram</a>
        <a href="#">WhatsApp</a>
        <a href="#">stayaway.com.co</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

const generarTemplateBienvenida = (usuario, passwordPlana) => {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a StayAway Rifas</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #f7f9fc 0%, #CFDEE7 100%);
      padding: 20px;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(10, 54, 157, 0.18);
    }
    .header {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      font-size: 30px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .welcome-icon {
      text-align: center;
      font-size: 72px;
      margin-bottom: 20px;
    }
    .greeting {
      font-size: 22px;
      color: #0A369D;
      font-weight: 800;
      text-align: center;
      margin-bottom: 14px;
    }
    .message {
      font-size: 15px;
      color: #4a4a4a;
      line-height: 1.7;
      margin-bottom: 28px;
      text-align: center;
    }
    .credentials-box {
      background: #f5f7fb;
      border-radius: 14px;
      padding: 24px;
      margin: 28px 0;
      border-left: 5px solid #0A369D;
    }
    .credentials-box h3 {
      font-size: 16px;
      color: #0A369D;
      font-weight: 800;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .credential-row {
      display: flex;
      justify-content: space-between;
      padding: 11px 0;
      border-bottom: 1px solid #CFDEE7;
    }
    .credential-row:last-child { border-bottom: none; }
    .credential-label {
      font-weight: 600;
      color: #5a6370;
      font-size: 14px;
    }
    .credential-value {
      color: #0A369D;
      font-weight: 700;
      font-size: 14px;
    }
    .password-value {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: #ffffff;
      padding: 4px 14px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.08em;
    }
    .alert-box {
      background: #f0f4ff;
      border: 2px solid #CFDEE7;
      border-radius: 12px;
      padding: 16px;
      margin: 20px 0;
      color: #0A369D;
      font-size: 14px;
      line-height: 1.6;
      text-align: center;
    }
    .alert-box strong {
      display: block;
      margin-bottom: 4px;
      font-size: 15px;
    }
    .cta-wrapper {
      text-align: center;
      margin: 28px 0 10px;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: white;
      padding: 14px 36px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      box-shadow: 0 10px 25px rgba(10, 54, 157, 0.35);
    }
    .footer {
      background: #0A369D;
      color: #ffffff;
      padding: 28px 30px;
      text-align: center;
      font-size: 13px;
    }
    .footer p { margin: 4px 0; opacity: 0.85; }
    .footer .social-links { margin-top: 16px; }
    .footer .social-links a {
      color: #92B4F4;
      text-decoration: none;
      margin: 0 10px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>👋 StayAway Rifas</h1>
      <p>¡Bienvenido a la comunidad!</p>
    </div>

    <div class="content">
      <div class="welcome-icon">🎊</div>

      <h2 class="greeting">¡Hola, ${usuario.nombres} ${usuario.apellidos}!</h2>

      <p class="message">
        Tu cuenta ha sido creada exitosamente. Ya puedes ingresar a la plataforma
        y participar en nuestras rifas con las siguientes credenciales:
      </p>

      <div class="credentials-box">
        <h3>🔐 Tus credenciales de acceso</h3>
        <div class="credential-row">
          <span class="credential-label">Correo electrónico:</span>
          <span class="credential-value">${usuario.correo_electronico}</span>
        </div>
        <div class="credential-row">
          <span class="credential-label">Contraseña temporal:</span>
          <span class="password-value">${passwordPlana}</span>
        </div>
      </div>

      <div class="alert-box">
        <strong>⚠️ Importante</strong>
        Por seguridad, te recomendamos cambiar tu contraseña después de iniciar sesión por primera vez.
      </div>

      <div class="cta-wrapper">
        <a href="${process.env.FRONTEND_URL}" class="cta-button">Ingresar a StayAway Rifas →</a>
      </div>
    </div>

    <div class="footer">
      <p>StayAway Rifas — Todos los derechos reservados © 2026</p>
      <p>Si no solicitaste esta cuenta, ignora este correo.</p>
      <div class="social-links">
        <a href="#">Instagram</a>
        <a href="#">WhatsApp</a>
        <a href="#">stayaway.com.co</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

const generarTemplateRecuperacion = (usuario, resetUrl) => {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecer contraseña - StayAway Rifas</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #f7f9fc 0%, #CFDEE7 100%);
      padding: 20px;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(10, 54, 157, 0.18);
    }
    .header {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      font-size: 30px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .lock-icon {
      text-align: center;
      font-size: 72px;
      margin-bottom: 20px;
    }
    .greeting {
      font-size: 22px;
      color: #0A369D;
      font-weight: 800;
      text-align: center;
      margin-bottom: 14px;
    }
    .message {
      font-size: 15px;
      color: #4a4a4a;
      line-height: 1.7;
      margin-bottom: 28px;
      text-align: center;
    }
    .cta-wrapper {
      text-align: center;
      margin: 28px 0;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: white;
      padding: 16px 40px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      font-size: 16px;
      box-shadow: 0 10px 25px rgba(10, 54, 157, 0.35);
    }
    .expiry-box {
      background: #f0f4ff;
      border: 2px solid #CFDEE7;
      border-radius: 12px;
      padding: 16px;
      margin: 24px 0;
      text-align: center;
      color: #0A369D;
      font-size: 14px;
      line-height: 1.6;
    }
    .expiry-box strong {
      display: block;
      margin-bottom: 4px;
      font-size: 15px;
    }
    .url-fallback {
      background: #f5f7fb;
      border-radius: 10px;
      padding: 14px;
      margin: 20px 0;
      word-break: break-all;
      font-size: 12px;
      color: #5a6370;
      text-align: center;
      border: 1px solid #CFDEE7;
    }
    .url-fallback strong {
      display: block;
      color: #0A369D;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .ignore-note {
      font-size: 13px;
      color: #8a96a8;
      text-align: center;
      margin-top: 8px;
    }
    .footer {
      background: #0A369D;
      color: #ffffff;
      padding: 28px 30px;
      text-align: center;
      font-size: 13px;
    }
    .footer p { margin: 4px 0; opacity: 0.85; }
    .footer .social-links { margin-top: 16px; }
    .footer .social-links a {
      color: #92B4F4;
      text-decoration: none;
      margin: 0 10px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🔐 StayAway Rifas</h1>
      <p>Restablece tu contraseña</p>
    </div>

    <div class="content">
      <div class="lock-icon">🔑</div>

      <h2 class="greeting">¡Hola, ${usuario.nombres}!</h2>

      <p class="message">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta.
        Haz clic en el botón a continuación para crear una nueva contraseña:
      </p>

      <div class="cta-wrapper">
        <a href="${resetUrl}" class="cta-button">Restablecer contraseña →</a>
      </div>

      <div class="expiry-box">
        <strong>⏱️ Este enlace expira en 1 hora</strong>
        Si no solicitaste este cambio, puedes ignorar este correo con total seguridad.
      </div>

      <div class="url-fallback">
        <strong>¿El botón no funciona? Copia este enlace en tu navegador:</strong>
        ${resetUrl}
      </div>

      <p class="ignore-note">
        Si no solicitaste restablecer tu contraseña, tu cuenta sigue segura y no es necesario hacer nada.
      </p>
    </div>

    <div class="footer">
      <p>StayAway Rifas — Todos los derechos reservados © 2026</p>
      <p>Este correo fue enviado automáticamente, por favor no respondas.</p>
      <div class="social-links">
        <a href="#">Instagram</a>
        <a href="#">WhatsApp</a>
        <a href="#">stayaway.com.co</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};
/**
 * 🏆 Enviar correo al GANADOR
 */
export const enviarCorreoGanador = async (ganador, rifa, numeroGanador, loteriaReferencia) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: ganador.correo_electronico,
      subject: `🏆 ¡FELICIDADES! Eres el ganador de ${rifa.titulo}`,
      html: generarTemplateGanador(ganador, rifa, numeroGanador, loteriaReferencia),
    });

    if (error) {
      console.error('❌ Error Resend (ganador):', error);
      return { success: false, error };
    }

    console.log('✅ Correo al ganador enviado:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error enviando correo al ganador:', error);
    return { success: false, error };
  }
};

/**
 * 📧 Enviar correo a PARTICIPANTES con PDF adjunto
 */
export const enviarCorreoParticipantes = async (usuario, rifa, numeroGanador, numerosUsuario, loteriaReferencia) => {
  try {
    console.log('📄 Generando PDF de boletos para participante...');

    // ✅ Asegurarse de que la rifa tenga todos los campos nuevos de Coljuegos
    // Si viene del adminController puede que no tenga todos los campos,
    // hacemos un fetch de seguridad
    let rifaCompleta = rifa;
    if (!rifa.numero_resolucion && !rifa.imagen_boleta_url) {
      const { data: rifaFetched } = await supabaseAdmin
        .from('rifas')
        .select(`
          id, titulo, cantidad_numeros, precio_unitario, fecha_sorteo,
          loteria_referencia, descripcion, descripcion_premios, valor_premios,
          numero_resolucion, fecha_autorizacion, termino_caducidad,
          responsable_nombre, responsable_domicilio, responsable_id,
          imagen_boleta_url
        `)
        .eq('id', rifa.id)
        .single();
      if (rifaFetched) rifaCompleta = rifaFetched;
    }

    const pdfBuffer = await generarPDFBoletos(usuario, rifaCompleta, numerosUsuario);

    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: usuario.correo_electronico,
      subject: `🎲 Rifa Sorteada - ${rifa.titulo}`,
      html: generarTemplateParticipantes(usuario, rifa, numeroGanador, numerosUsuario, loteriaReferencia),
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `StayAway_Boletos_Sorteo_${rifa.id}.pdf`,
        }
      ]
    });

    if (error) {
      console.error('❌ Error Resend (participante):', error);
      return { success: false, error };
    }

    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error enviando correo a participante:', error);
    return { success: false, error };
  }
};

/**
 * 🎉 Template de email para el GANADOR
 */
const generarTemplateGanador = (ganador, rifa, numeroGanador, loteriaReferencia) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333333;
      background: linear-gradient(135deg, #f7f9fc 0%, #CFDEE7 100%);
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(10, 54, 157, 0.18);
    }
    .header {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: #ffffff;
      padding: 50px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 12px 0;
      font-size: 32px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .header p {
      margin: 0;
      font-size: 17px;
      opacity: 0.92;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 22px;
      color: #0A369D;
      font-weight: 800;
      margin-bottom: 14px;
    }
    .intro-text {
      font-size: 15px;
      color: #4a4a4a;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    .winner-banner {
      background: linear-gradient(135deg, #f0f4ff 0%, #ffffff 100%);
      border: 3px solid #0A369D;
      border-radius: 16px;
      padding: 30px;
      text-align: center;
      margin: 28px 0;
      box-shadow: 0 10px 25px rgba(10, 54, 157, 0.12);
    }
    .winner-label {
      font-size: 13px;
      color: #5a6370;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      margin-bottom: 10px;
    }
    .winner-number {
      font-size: 52px;
      font-weight: 900;
      color: #0A369D;
      font-family: 'Courier New', monospace;
      margin: 14px 0;
      letter-spacing: 4px;
    }
    .winner-trophy {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .info-box {
      background: #f5f7fb;
      border-left: 5px solid #0A369D;
      padding: 24px;
      border-radius: 14px;
      margin: 26px 0;
    }
    .info-box h3 {
      color: #0A369D;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 11px 0;
      border-bottom: 1px solid #CFDEE7;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label {
      color: #5a6370;
      font-weight: 600;
      font-size: 14px;
    }
    .info-value {
      color: #0A369D;
      font-weight: 700;
      font-size: 14px;
    }
    .instructions-box {
      background: #f0f4ff;
      border: 2px solid #CFDEE7;
      border-radius: 14px;
      padding: 24px;
      margin: 26px 0;
    }
    .instructions-box h3 {
      color: #0A369D;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
    }
    .instructions-box ol {
      margin: 0;
      padding-left: 20px;
    }
    .instructions-box li {
      color: #4a4a4a;
      margin: 10px 0;
      line-height: 1.7;
      font-size: 14px;
    }
    .divider {
      height: 1px;
      background: #CFDEE7;
      margin: 28px 0;
    }
    .closing-note {
      color: #5a6370;
      font-size: 14px;
      text-align: center;
      line-height: 1.7;
    }
    .footer {
      background: #0A369D;
      color: #ffffff;
      text-align: center;
      padding: 28px 30px;
    }
    .footer .brand {
      font-weight: 800;
      font-size: 16px;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .footer p {
      margin: 4px 0;
      font-size: 13px;
      opacity: 0.85;
    }
    .footer a {
      color: #92B4F4;
      text-decoration: none;
      font-weight: 600;
    }
    .footer .social-links {
      margin-top: 16px;
    }
    .footer .social-links a {
      margin: 0 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏆 ¡Felicidades!</h1>
      <p>Eres el ganador de nuestra rifa</p>
    </div>

    <div class="content">
      <h2 class="greeting">Estimado/a ${ganador.nombres} ${ganador.apellidos},</h2>
      <p class="intro-text">
        Nos complace enormemente informarte que has resultado ganador/a de nuestra rifa.
        Este es un momento especial y queremos asegurarnos de que tengas toda la información necesaria.
      </p>

      <div class="winner-banner">
        <div class="winner-trophy">🎯</div>
        <p class="winner-label">Número Ganador</p>
        <div class="winner-number">#${numeroGanador}</div>
      </div>

      <div class="info-box">
        <h3>📋 Información de la Rifa</h3>
        <div class="info-row">
          <span class="info-label">Rifa:</span>
          <span class="info-value">${rifa.titulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha del sorteo:</span>
          <span class="info-value">${new Date(rifa.fecha_sorteo).toLocaleDateString('es-CO', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}</span>
        </div>
        ${loteriaReferencia ? `
        <div class="info-row">
          <span class="info-label">Lotería de referencia:</span>
          <span class="info-value">${loteriaReferencia}</span>
        </div>
        ` : ''}
      </div>

      <div class="instructions-box">
        <h3>🚀 Próximos pasos para reclamar tu premio</h3>
        <ol>
          <li>Conserva este correo como comprobante de tu premio.</li>
          <li>Nuestro equipo se pondrá en contacto contigo en las próximas 48 horas hábiles.</li>
          <li>Deberás presentar tu documento de identidad original para verificación.</li>
          <li>El proceso de entrega del premio se coordinará según la disponibilidad de ambas partes.</li>
          <li>Para cualquier consulta, puedes comunicarte con nosotros a través de nuestros canales oficiales.</li>
        </ol>
      </div>

      <div class="divider"></div>

      <p class="closing-note">
        Te agradecemos por tu participación y confianza en StayAway Rifas.<br>
        Esperamos que disfrutes tu premio. ¡Muchas felicidades! 🎉
      </p>
    </div>

    <div class="footer">
      <p class="brand">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Contacto: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
      <div class="social-links">
        <a href="#">Instagram</a>
        <a href="#">WhatsApp</a>
        <a href="#">stayaway.com.co</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * 📬 Template de email para PARTICIPANTES (no ganadores)
 */
const generarTemplateParticipantes = (usuario, rifa, numeroGanador, numerosUsuario, loteriaReferencia) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333333;
      background: linear-gradient(135deg, #f7f9fc 0%, #CFDEE7 100%);
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(10, 54, 157, 0.18);
    }
    .header {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: #ffffff;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.92;
    }
    .content { padding: 40px 30px; }
    .greeting {
      color: #0A369D;
      font-size: 22px;
      font-weight: 800;
      margin-bottom: 14px;
    }
    .intro-text {
      color: #4a4a4a;
      font-size: 15px;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    .winner-box {
      background: linear-gradient(135deg, #f0f4ff 0%, #ffffff 100%);
      border: 2px solid #0A369D;
      border-radius: 16px;
      padding: 28px;
      text-align: center;
      margin: 26px 0;
      box-shadow: 0 10px 25px rgba(10, 54, 157, 0.10);
    }
    .winner-box h3 {
      color: #0A369D;
      margin: 0 0 12px 0;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .winner-number {
      font-size: 40px;
      font-weight: 900;
      color: #0A369D;
      font-family: 'Courier New', monospace;
      margin: 14px 0;
      letter-spacing: 3px;
    }
    .info-box {
      background: #f5f7fb;
      border-left: 5px solid #0A369D;
      padding: 24px;
      border-radius: 14px;
      margin: 26px 0;
    }
    .info-box h3 {
      color: #0A369D;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 11px 0;
      border-bottom: 1px solid #CFDEE7;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label {
      color: #5a6370;
      font-weight: 600;
      font-size: 14px;
    }
    .info-value {
      color: #0A369D;
      font-weight: 700;
      font-size: 14px;
    }
    .numbers-section { margin: 28px 0; }
    .numbers-section h3 {
      color: #0A369D;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
      text-align: center;
    }
    .numbers-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 14px;
      margin: 16px 0;
    }
    .number {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      border-radius: 10px;
      padding: 14px 8px;
      text-align: center;
      font-weight: 700;
      font-size: 14px;
      color: #ffffff;
      font-family: 'Courier New', monospace;
      box-shadow: 0 4px 12px rgba(10, 54, 157, 0.20);
    }
    .more-numbers {
      text-align: center;
      color: #5a6370;
      font-size: 13px;
      margin-top: 10px;
    }
    .divider {
      height: 1px;
      background: #CFDEE7;
      margin: 28px 0;
    }
    .thanks-box {
      background: #f0f4ff;
      border: 2px solid #CFDEE7;
      border-radius: 14px;
      padding: 24px;
      text-align: center;
      margin: 26px 0;
    }
    .thanks-box p {
      color: #0A369D;
      font-weight: 600;
      font-size: 15px;
      line-height: 1.6;
    }
    .closing-note {
      color: #5a6370;
      font-size: 14px;
      text-align: center;
      line-height: 1.7;
      margin-top: 10px;
    }
    .footer {
      background: #0A369D;
      color: #ffffff;
      text-align: center;
      padding: 28px 30px;
    }
    .footer .brand {
      font-weight: 800;
      font-size: 16px;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .footer p {
      margin: 4px 0;
      font-size: 13px;
      opacity: 0.85;
    }
    .footer a {
      color: #92B4F4;
      text-decoration: none;
      font-weight: 600;
    }
    .footer .social-links { margin-top: 16px; }
    .footer .social-links a { margin: 0 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Rifa Sorteada</h1>
      <p>Resultados oficiales del sorteo</p>
    </div>

    <div class="content">
      <h2 class="greeting">Estimado/a ${usuario.nombres} ${usuario.apellidos},</h2>
      <p class="intro-text">
        Te informamos que el sorteo de la rifa en la que participaste ha sido realizado exitosamente.
        A continuación te presentamos los resultados oficiales:
      </p>

      <div class="winner-box">
        <h3>🏆 Número Ganador</h3>
        <div class="winner-number">#${numeroGanador}</div>
      </div>

      <div class="info-box">
        <h3>📋 Información del Sorteo</h3>
        <div class="info-row">
          <span class="info-label">Rifa:</span>
          <span class="info-value">${rifa.titulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha del sorteo:</span>
          <span class="info-value">${new Date(rifa.fecha_sorteo).toLocaleDateString('es-CO', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}</span>
        </div>
        ${loteriaReferencia ? `
        <div class="info-row">
          <span class="info-label">Lotería de referencia:</span>
          <span class="info-value">${loteriaReferencia}</span>
        </div>
        ` : ''}
      </div>

      <div class="numbers-section">
        <h3>🎯 Tus Números Participantes</h3>
        <div class="numbers-grid">
          ${numerosUsuario.slice(0, 10).map(numero => `<div class="number">#${numero}</div>`).join('')}
        </div>
        ${numerosUsuario.length > 10
          ? `<p class="more-numbers">📎 Y ${numerosUsuario.length - 10} números más — ver todos en el PDF adjunto</p>`
          : ''}
      </div>

      <div class="divider"></div>

      <div class="thanks-box">
        <p>🙌 Gracias por tu participación. Te invitamos a estar atento a nuestras próximas rifas.</p>
      </div>

      <p class="closing-note">
        Puedes seguir nuestras redes sociales para enterarte de futuros sorteos y promociones especiales.
      </p>
    </div>

    <div class="footer">
      <p class="brand">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Contacto: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
      <div class="social-links">
        <a href="#">Instagram</a>
        <a href="#">WhatsApp</a>
        <a href="#">stayaway.com.co</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * 📅 Enviar correo de SORTEO DESIERTO con PDF adjunto
 */
export const enviarCorreoSorteoDesierto = async (
  usuario,
  rifa,
  numeroSorteado,
  numerosUsuario,
  nuevaFecha,
  loteriaReferencia
) => {
  try {
    console.log('📄 Generando PDF de boletos para sorteo desierto...');

    // ✅ Mismo fetch de seguridad para garantizar campos Coljuegos
    let rifaCompleta = rifa;
    if (!rifa.numero_resolucion && !rifa.imagen_boleta_url) {
      const { data: rifaFetched } = await supabaseAdmin
        .from('rifas')
        .select(`
          id, titulo, cantidad_numeros, precio_unitario, fecha_sorteo,
          loteria_referencia, descripcion, descripcion_premios, valor_premios,
          numero_resolucion, fecha_autorizacion, termino_caducidad,
          responsable_nombre, responsable_domicilio, responsable_id,
          imagen_boleta_url
        `)
        .eq('id', rifa.id)
        .single();
      if (rifaFetched) rifaCompleta = rifaFetched;
    }

    const pdfBuffer = await generarPDFBoletos(usuario, rifaCompleta, numerosUsuario);

    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: usuario.correo_electronico,
      subject: `🔄 Sorteo Reprogramado - ${rifa.titulo}`,
      html: generarTemplateSorteoDesierto(
        usuario,
        rifa,
        numeroSorteado,
        numerosUsuario,
        nuevaFecha,
        loteriaReferencia
      ),
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `StayAway_Boletos_Desierto_${rifa.id}.pdf`,
        }
      ]
    });

    if (error) {
      console.error('❌ Error Resend (sorteo desierto):', error);
      return { success: false, error };
    }

    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error enviando correo de sorteo desierto:', error);
    return { success: false, error };
  }
};
/**
 * 🔄 Template de email para SORTEO DESIERTO
 */
const generarTemplateSorteoDesierto = (
  usuario,
  rifa,
  numeroSorteado,
  numerosUsuario,
  nuevaFecha,
  loteriaReferencia
) => {
  const fechaFormateada = new Date(nuevaFecha).toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333333;
      background: linear-gradient(135deg, #f7f9fc 0%, #CFDEE7 100%);
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 18px 45px rgba(10, 54, 157, 0.18);
    }
    .header {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: #ffffff;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.92;
    }
    .content { padding: 40px 30px; }
    .greeting {
      color: #0A369D;
      font-size: 22px;
      font-weight: 800;
      margin-bottom: 14px;
    }
    .intro-text {
      color: #4a4a4a;
      font-size: 15px;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    .alert-box {
      background: #f0f4ff;
      border: 2px solid #CFDEE7;
      border-radius: 16px;
      padding: 26px;
      margin: 26px 0;
      text-align: center;
    }
    .alert-box h3 {
      color: #0A369D;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 14px;
    }
    .alert-box p {
      color: #5a6370;
      font-size: 14px;
      margin-top: 12px;
      line-height: 1.6;
    }
    .numero-sorteado {
      font-size: 44px;
      font-weight: 900;
      color: #0A369D;
      font-family: 'Courier New', monospace;
      margin: 14px 0;
      letter-spacing: 3px;
    }
    .new-date-box {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      border-radius: 16px;
      padding: 26px;
      text-align: center;
      margin: 26px 0;
      box-shadow: 0 10px 25px rgba(10, 54, 157, 0.35);
      color: #ffffff;
    }
    .new-date-box h3 {
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 12px;
      opacity: 0.92;
    }
    .new-date-box p {
      font-size: 14px;
      opacity: 0.85;
      margin-bottom: 10px;
    }
    .new-date {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      margin: 10px 0 0;
      letter-spacing: 0.02em;
    }
    .info-box {
      background: #f5f7fb;
      border-left: 5px solid #0A369D;
      padding: 24px;
      border-radius: 14px;
      margin: 26px 0;
    }
    .info-box h3 {
      color: #0A369D;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 11px 0;
      border-bottom: 1px solid #CFDEE7;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label {
      color: #5a6370;
      font-weight: 600;
      font-size: 14px;
    }
    .info-value {
      color: #0A369D;
      font-weight: 700;
      font-size: 14px;
    }
    .numbers-section { margin: 28px 0; }
    .numbers-section h3 {
      color: #0A369D;
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 16px;
      text-align: center;
    }
    .numbers-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 14px;
      margin: 16px 0;
    }
    .number {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      border-radius: 10px;
      padding: 14px 8px;
      text-align: center;
      font-weight: 700;
      font-size: 14px;
      color: #ffffff;
      font-family: 'Courier New', monospace;
      box-shadow: 0 4px 12px rgba(10, 54, 157, 0.20);
    }
    .more-numbers {
      text-align: center;
      color: #5a6370;
      font-size: 13px;
      margin-top: 10px;
    }
    .divider {
      height: 1px;
      background: #CFDEE7;
      margin: 28px 0;
    }
    .lucky-note {
      color: #0A369D;
      font-weight: 700;
      text-align: center;
      font-size: 15px;
      margin-bottom: 10px;
    }
    .closing-note {
      color: #5a6370;
      font-size: 14px;
      text-align: center;
      line-height: 1.7;
    }
    .footer {
      background: #0A369D;
      color: #ffffff;
      text-align: center;
      padding: 28px 30px;
    }
    .footer .brand {
      font-weight: 800;
      font-size: 16px;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .footer p {
      margin: 4px 0;
      font-size: 13px;
      opacity: 0.85;
    }
    .footer a {
      color: #92B4F4;
      text-decoration: none;
      font-weight: 600;
    }
    .footer .social-links { margin-top: 16px; }
    .footer .social-links a { margin: 0 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Sorteo Sin Ganador</h1>
      <p>Información importante sobre el sorteo</p>
    </div>

    <div class="content">
      <h2 class="greeting">Estimado/a ${usuario.nombres} ${usuario.apellidos},</h2>
      <p class="intro-text">
        Te informamos que se ha realizado el sorteo de la rifa en la que participaste.
        Sin embargo, el número sorteado no fue adquirido por ningún participante.
      </p>

      <div class="alert-box">
        <h3>⚡ Número Sorteado (No Vendido)</h3>
        <div class="numero-sorteado">#${numeroSorteado}</div>
        <p>Este número no tiene comprador asignado, por lo que se procederá a un nuevo sorteo.</p>
      </div>

      <div class="new-date-box">
        <h3>📅 Sorteo Reprogramado</h3>
        <p>La nueva fecha para el sorteo es:</p>
        <div class="new-date">${fechaFormateada}</div>
      </div>

      <div class="info-box">
        <h3>📋 Información del Sorteo</h3>
        <div class="info-row">
          <span class="info-label">Rifa:</span>
          <span class="info-value">${rifa.titulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Estado:</span>
          <span class="info-value">Activa (sigue disponible para compra)</span>
        </div>
        ${loteriaReferencia ? `
        <div class="info-row">
          <span class="info-label">Lotería de referencia:</span>
          <span class="info-value">${loteriaReferencia}</span>
        </div>
        ` : ''}
      </div>

      <div class="numbers-section">
        <h3>🎯 Tus Números Siguen Participando</h3>
        <div class="numbers-grid">
          ${numerosUsuario.slice(0, 10).map(numero => `<div class="number">#${numero}</div>`).join('')}
        </div>
        ${numerosUsuario.length > 10
          ? `<p class="more-numbers">📎 Y ${numerosUsuario.length - 10} números más — ver todos en el PDF adjunto</p>`
          : ''}
      </div>

      <div class="divider"></div>

      <p class="lucky-note">
        🍀 Tus números siguen activos y participarán en el nuevo sorteo programado. ¡Mucha suerte!
      </p>
      <p class="closing-note">
        Estaremos atentos para informarte sobre los resultados del nuevo sorteo.
      </p>
    </div>

    <div class="footer">
      <p class="brand">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Contacto: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
      <div class="social-links">
        <a href="#">Instagram</a>
        <a href="#">WhatsApp</a>
        <a href="#">stayaway.com.co</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

import { Resend } from 'resend';
import PDFDocument from 'pdfkit';

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
 * 📄 Generar PDF profesional con los números del usuario
 * Incluye: datos del usuario, números organizados con colores corporativos
 */
const generarPDFNumeros = (usuario, rifa, numerosUsuario) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // COLORES CORPORATIVOS
      const colorAzulOscuro  = '#0A369D';
      const colorAzulMedio   = '#4472CA';
      const colorAzulClaro   = '#92B4F4';
      const colorFondoSuave  = '#f0f4ff';
      const colorBorde       = '#CFDEE7';
      const colorFondoGris   = '#f5f7fb';
      const colorTextoOscuro = '#2d2d2d';
      const colorTextoGris   = '#5a6370';

      // ═══════════════════════════════════════
      // ENCABEZADO
      // ═══════════════════════════════════════

      // Fondo principal del header
      doc.rect(0, 0, 595, 150)
         .fill(colorAzulOscuro);

      // Franja inferior del header (acento más claro)
      doc.rect(0, 120, 595, 30)
         .fill(colorAzulMedio);

      // Título principal
      doc.fontSize(32)
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text('StayAway Rifas', 50, 38, { align: 'center' });

      // Subtítulo con título de la rifa
      doc.fontSize(17)
         .fillColor('#ffffff')
         .font('Helvetica')
         .opacity(0.92)
         .text(rifa.titulo, 50, 82, { align: 'center', width: 495 });

      // Fecha de generación en la franja inferior
      doc.fontSize(10)
         .fillColor('#ffffff')
         .font('Helvetica')
         .opacity(0.85)
         .text(`Generado el ${new Date().toLocaleDateString('es-CO', {
           year: 'numeric',
           month: 'long',
           day: 'numeric',
           hour: '2-digit',
           minute: '2-digit'
         })}`, 50, 128, { align: 'center' });

      // Resetear opacidad
      doc.opacity(1);

      // ═══════════════════════════════════════
      // SECCIÓN: DATOS DEL USUARIO
      // ═══════════════════════════════════════

      let currentY = 180;

      // Título de sección
      doc.fontSize(14)
         .fillColor(colorAzulOscuro)
         .font('Helvetica-Bold')
         .text('Información del Participante', 50, currentY);

      // Línea decorativa bajo el título
      doc.rect(50, currentY + 22, 495, 3)
         .fill(colorAzulMedio);

      currentY += 38;

      // Caja de información del usuario
      doc.rect(50, currentY, 495, 120)
         .fillAndStroke(colorFondoGris, colorBorde)
         .lineWidth(1.5);

      // Borde izquierdo destacado (acento azul)
      doc.rect(50, currentY, 5, 120)
         .fill(colorAzulOscuro);

      currentY += 20;

      const datosUsuario = [
        { label: 'Nombre Completo:', valor: `${usuario.nombres} ${usuario.apellidos}` },
        { label: 'Documento:',       valor: `${usuario.tipo_documento || 'CC'} ${usuario.numero_documento}` },
        { label: 'Correo:',          valor: usuario.correo_electronico },
        { label: 'Teléfono:',        valor: usuario.telefono || 'No registrado' }
      ];

      datosUsuario.forEach((dato, index) => {
        const yPos = currentY + (index * 21);

        doc.fontSize(10)
           .fillColor(colorTextoGris)
           .font('Helvetica-Bold')
           .text(dato.label, 70, yPos);

        doc.fontSize(10)
           .fillColor(colorTextoOscuro)
           .font('Helvetica')
           .text(dato.valor, 220, yPos);
      });

      currentY += 115;

      // ═══════════════════════════════════════
      // SECCIÓN: TUS NÚMEROS
      // ═══════════════════════════════════════

      currentY += 12;

      // Título de sección
      doc.fontSize(14)
         .fillColor(colorAzulOscuro)
         .font('Helvetica-Bold')
         .text('Tus Números de la Suerte', 50, currentY);

      // Línea decorativa bajo el título
      doc.rect(50, currentY + 22, 495, 3)
         .fill(colorAzulMedio);

      currentY += 38;

      // Badge con contador de números
      doc.rect(50, currentY, 495, 30)
         .fill(colorFondoSuave);

      doc.fontSize(11)
         .fillColor(colorAzulOscuro)
         .font('Helvetica-Bold')
         .text(`Total de números adquiridos: ${numerosUsuario.length}`, 50, currentY + 9, {
           align: 'center',
           width: 495
         });

      currentY += 46;

      // ═══════════════════════════════════════
      // GRID DE NÚMEROS (8 por fila)
      // ═══════════════════════════════════════

      const numerosPerRow   = 8;
      const boxWidth        = 56;
      const boxHeight       = 45;
      const horizontalSpacing = 6;
      const verticalSpacing   = 10;
      const startX = 50;
      let x = startX;
      let y = currentY;

      numerosUsuario.forEach((numero, index) => {
        if (index > 0 && index % numerosPerRow === 0) {
          x = startX;
          y += boxHeight + verticalSpacing;

          if (y > 700) {
            doc.addPage();
            y = 50;

            // Header compacto en páginas adicionales
            doc.rect(0, 0, 595, 45)
               .fill(colorAzulOscuro);

            doc.fontSize(13)
               .fillColor('#ffffff')
               .font('Helvetica-Bold')
               .text('StayAway Rifas — Tus Números (continuación)', 50, 14, {
                 align: 'center',
                 width: 495
               });

            y = 65;
          }
        }

        // Caja del número: fondo suave + borde azul
        doc.rect(x, y, boxWidth, boxHeight)
           .fillAndStroke(colorFondoSuave, colorAzulMedio)
           .lineWidth(1.5);

        // Franja superior de color en cada caja
        doc.rect(x, y, boxWidth, 6)
           .fill(colorAzulOscuro);

        // Número centrado
        doc.fontSize(15)
           .fillColor(colorAzulOscuro)
           .font('Helvetica-Bold')
           .text(`#${numero}`, x, y + 16, {
             width: boxWidth,
             align: 'center'
           });

        x += boxWidth + horizontalSpacing;
      });

      // ═══════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════

      doc.y = 750;

      // Línea separadora azul
      doc.strokeColor(colorAzulMedio)
         .lineWidth(2)
         .moveTo(50, 750)
         .lineTo(545, 750)
         .stroke();

      // Franja de fondo del footer
      doc.rect(0, 755, 595, 90)
         .fill(colorAzulOscuro);

      doc.fontSize(11)
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text('StayAway Rifas', 50, 765, { align: 'center', width: 495 });

      doc.fontSize(9)
         .fillColor('#ffffff')
         .font('Helvetica')
         .opacity(0.85)
         .text('Todos los derechos reservados © 2026', 50, 780, {
           align: 'center',
           width: 495
         });

      doc.fontSize(9)
         .fillColor('#ffffff')
         .opacity(0.75)
         .text('Guarda este documento como comprobante de tu participación', 50, 795, {
           align: 'center',
           width: 495
         });

      doc.opacity(1);
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

    // ✅ Generar PDF con los números
    console.log("📄 Generando PDF de números...");
    
    // Datos de la rifa para el PDF
    const rifaData = {
      titulo: transaccion.rifaTitulo,
      cantidad_numeros: transaccion.cantidad // Para calcular dígitos
    };

    const pdfBuffer = await generarPDFNumeros(usuario, rifaData, numerosAsignados);
    console.log("✅ PDF generado exitosamente");

    // ✅ Convertir PDF a base64 para adjuntar
    const pdfBase64 = pdfBuffer.toString('base64');

    // ✅ Generar HTML del correo
    const htmlContent = generarTemplateCompra(usuario, transaccion, numerosAsignados);

    // ✅ Enviar correo con Resend
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>', // ← CORREGIR AQUÍ
      to: [usuario.correo_electronico],
      subject: `✅ Compra Exitosa - ${transaccion.rifaTitulo}${transaccion.numerosGratis > 0 ? ' 🎁 ¡Con números gratis!' : ''}`,
      html: htmlContent,
      attachments: [
        {
          filename: `StayAway_Numeros_Rifa_${transaccion.referencia}.pdf`,
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
      margin-bottom: 18px;
      text-align: center;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .numbers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
      gap: 10px;
      margin-top: 18px;
    }
    .number-box {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      color: white;
      padding: 14px;
      border-radius: 10px;
      text-align: center;
      font-weight: 700;
      font-size: 17px;
      box-shadow: 0 4px 12px rgba(10, 54, 157, 0.25);
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
      .numbers-grid { grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 8px; }
      .number-box { padding: 11px; font-size: 15px; }
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
        Encuentra el PDF con todos tus números en el archivo adjunto de este correo.
      </div>

      <div class="numbers-section">
        <h3 class="section-title">🎯 Tus Números</h3>
        <div class="numbers-grid">
          ${numerosAsignados.map(n => `<div class="number-box">#${n}</div>`).join('')}
        </div>
      </div>
    </div>

    <div class="footer">
      <p>StayAway Rifas — Todos los derechos reservados © 2026</p>
      <p>Guarda este correo como comprobante de tu participación</p>
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
    console.log('📄 Generando PDF de números para participante...');
    
    // Generar PDF
    const pdfBuffer = await generarPDFNumeros(usuario, rifa, numerosUsuario);

    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: usuario.correo_electronico,
      subject: `🎲 Rifa Sorteada - ${rifa.titulo}`,
      html: generarTemplateParticipantes(usuario, rifa, numeroGanador, numerosUsuario, loteriaReferencia),
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `StayAway_Numeros_Rifa_${rifa.id}.pdf`,
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
    .content {
      padding: 40px 30px;
    }
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
    .numbers-section {
      margin: 28px 0;
    }
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
      grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
      gap: 10px;
      margin: 16px 0;
    }
    .number {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      border-radius: 10px;
      padding: 12px;
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
          ${numerosUsuario.slice(0, 20).map(numero => `<div class="number">#${numero}</div>`).join('')}
        </div>
        ${numerosUsuario.length > 20
          ? `<p class="more-numbers">Y ${numerosUsuario.length - 20} números más...</p>`
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
    console.log('📄 Generando PDF de números para sorteo desierto...');
    
    // Generar PDF
    const pdfBuffer = await generarPDFNumeros(usuario, rifa, numerosUsuario);

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
          filename: `StayAway_Numeros_Sorteo_Desierto_${rifa.id}.pdf`,
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
    .content {
      padding: 40px 30px;
    }
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
    .numbers-section {
      margin: 28px 0;
    }
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
      grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
      gap: 10px;
      margin: 16px 0;
    }
    .number {
      background: linear-gradient(135deg, #0A369D 0%, #4472CA 100%);
      border-radius: 10px;
      padding: 12px;
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
        <h3>Sorteo Reprogramado</h3>
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
          ${numerosUsuario.slice(0, 20).map(numero => `<div class="number">#${numero}</div>`).join('')}
        </div>
        ${numerosUsuario.length > 20
          ? `<p class="more-numbers">Y ${numerosUsuario.length - 20} números más...</p>`
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
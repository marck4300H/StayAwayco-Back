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
 * 📧 Enviar correo de compra con PDF adjunto
 */
export const enviarCorreoCompraExitosa = async (usuario, transaccion, numerosAsignados) => {
  try {
    console.log('📄 Generando PDF de números...');
    
    // Generar PDF
    const pdfBuffer = await generarPDFNumeros(
      usuario, 
      { titulo: transaccion.rifaTitulo, id: transaccion.rifa_id }, 
      numerosAsignados
    );

    console.log('✅ PDF generado exitosamente');

    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: usuario.correo_electronico,
      subject: `🎉 ¡Compra Exitosa! - ${transaccion.rifaTitulo}`,
      html: generarTemplateCompra(usuario, transaccion, numerosAsignados),
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: `StayAway_Numeros_${transaccion.referencia}.pdf`,
        }
      ]
    });

    if (error) {
      console.error('❌ Error Resend:', error);
      return { success: false, error };
    }

    console.log('✅ Correo con PDF enviado:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error enviando correo con PDF:', error);
    return { success: false, error };
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
 * Templates de correo (MANTENER IGUAL)
 */
const generarTemplateCompra = (usuario, transaccion, numerosAsignados) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.6; 
      color: #333333; 
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container { 
      max-width: 600px; 
      margin: 30px auto; 
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
    .header { 
      background: linear-gradient(135deg, #c8a951 0%, #dfc77a 100%); 
      color: #ffffff; 
      padding: 40px 30px; 
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .content { 
      padding: 40px 30px;
    }
    .content h2 {
      color: #1a1a1a;
      font-size: 22px;
      margin: 0 0 20px 0;
    }
    .content p {
      color: #555555;
      font-size: 15px;
      margin: 15px 0;
    }
    .info-box {
      background: #f8f9fa;
      border-left: 4px solid #c8a951;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .info-box h3 {
      color: #c8a951;
      font-size: 18px;
      margin: 0 0 15px 0;
      font-weight: 600;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #666666;
      font-weight: 600;
    }
    .info-value {
      color: #1a1a1a;
      font-weight: 700;
    }
    .numbers-section {
      margin: 30px 0;
    }
    .numbers-section h3 {
      color: #1a1a1a;
      font-size: 18px;
      margin: 0 0 20px 0;
    }
    .numbers-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); 
      gap: 10px; 
      margin: 20px 0;
    }
    .number { 
      background: #ffffff;
      border: 2px solid #c8a951; 
      border-radius: 8px; 
      padding: 12px; 
      text-align: center; 
      font-weight: 700; 
      font-size: 16px;
      color: #c8a951;
      font-family: 'Courier New', monospace;
    }
    .success-message {
      background: linear-gradient(135deg, #e8f5e9 0%, #f1f8f4 100%);
      border: 2px solid #4caf50;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 25px 0;
    }
    .success-message p {
      color: #2e7d32;
      font-weight: 600;
      font-size: 16px;
      margin: 0;
    }
    .footer { 
      background: #1a1a1a;
      color: #ffffff;
      text-align: center; 
      padding: 30px;
    }
    .footer p {
      margin: 10px 0;
      font-size: 14px;
      color: #cccccc;
    }
    .footer a {
      color: #c8a951;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background: #e0e0e0;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Compra Exitosa</h1>
      <p>Gracias por participar en nuestra rifa</p>
    </div>
    
    <div class="content">
      <h2>Hola ${usuario.nombres} ${usuario.apellidos},</h2>
      <p>Tu compra ha sido procesada exitosamente. A continuación encontrarás los detalles completos de tu participación:</p>
      
      <div class="info-box">
        <h3>Detalles de la Compra</h3>
        <div class="info-row">
          <span class="info-label">Rifa:</span>
          <span class="info-value">${transaccion.rifaTitulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Cantidad de números:</span>
          <span class="info-value">${transaccion.cantidad}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total pagado:</span>
          <span class="info-value">$${transaccion.total.toLocaleString('es-CO')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Referencia:</span>
          <span class="info-value">${transaccion.referencia}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha:</span>
          <span class="info-value">${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      <div class="numbers-section">
        <h3>Tus Números Asignados</h3>
        <div class="numbers-grid">
          ${numerosAsignados.map(numero => `<div class="number">#${numero}</div>`).join('')}
        </div>
      </div>

      <div class="success-message">
        <p>Buena suerte. Los resultados del sorteo se publicarán en nuestras redes sociales.</p>
      </div>

      <div class="divider"></div>

      <p style="color: #666666; font-size: 14px;">Puedes ver tus números en cualquier momento accediendo a tu perfil en nuestra plataforma web.</p>
    </div>
    
    <div class="footer">
      <p style="font-weight: 600; font-size: 16px; color: #c8a951;">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Si tienes alguna pregunta, contáctanos en <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
    </div>
  </div>
</body>
</html>
  `;
};

const generarTemplateBienvenida = (usuario, passwordPlana) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.6; 
      color: #333333; 
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container { 
      max-width: 600px; 
      margin: 30px auto; 
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
    .header { 
      background: linear-gradient(135deg, #c8a951 0%, #dfc77a 100%); 
      color: #ffffff; 
      padding: 40px 30px; 
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 32px;
      font-weight: 700;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .content { 
      padding: 40px 30px;
    }
    .content h2 {
      color: #1a1a1a;
      font-size: 22px;
      margin: 0 0 20px 0;
    }
    .content p {
      color: #555555;
      font-size: 15px;
      margin: 15px 0;
    }
    .credentials-box {
      background: linear-gradient(135deg, #fff9e6 0%, #ffffff 100%);
      border: 3px solid #c8a951;
      border-radius: 12px;
      padding: 30px;
      margin: 30px 0;
    }
    .credentials-box h3 {
      color: #c8a951;
      font-size: 20px;
      margin: 0 0 20px 0;
      font-weight: 600;
      text-align: center;
    }
    .credential-row {
      margin: 15px 0;
    }
    .credential-label {
      color: #666666;
      font-weight: 600;
      font-size: 14px;
      display: block;
      margin-bottom: 8px;
    }
    .credential-value {
      background: #ffffff;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 12px 15px;
      font-size: 15px;
      color: #1a1a1a;
      font-weight: 600;
    }
    .password-box {
      background: #ffffff;
      border: 3px dashed #c8a951;
      border-radius: 10px;
      padding: 20px;
      margin: 15px 0;
      text-align: center;
    }
    .password-value {
      font-family: 'Courier New', monospace;
      font-size: 24px;
      font-weight: 900;
      color: #c8a951;
      letter-spacing: 2px;
      margin: 15px 0;
      word-break: break-all;
    }
    .warning-box {
      background: #fff3cd;
      border: 2px solid #ffc107;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .warning-box p {
      color: #856404;
      font-weight: 600;
      margin: 5px 0;
      font-size: 14px;
    }
    .warning-icon {
      color: #f59e0b;
      font-size: 24px;
      font-weight: 700;
    }
    .login-box {
      background: #e3f2fd;
      border: 2px solid #2196f3;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 25px 0;
    }
    .login-box p {
      color: #1976d2;
      font-weight: 600;
      margin: 10px 0;
    }
    .login-button {
      display: inline-block;
      background: linear-gradient(135deg, #c8a951 0%, #dfc77a 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 15px 40px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 16px;
      margin-top: 15px;
      transition: all 0.3s ease;
    }
    .login-button:hover {
      background: linear-gradient(135deg, #b89840 0%, #c8a951 100%);
      box-shadow: 0 4px 12px rgba(200, 169, 81, 0.4);
    }
    .benefits-box {
      background: #f8f9fa;
      border-left: 4px solid #c8a951;
      border-radius: 8px;
      padding: 25px;
      margin: 25px 0;
    }
    .benefits-box h3 {
      color: #c8a951;
      font-size: 18px;
      margin: 0 0 15px 0;
      font-weight: 600;
    }
    .benefits-box ul {
      margin: 15px 0;
      padding-left: 25px;
    }
    .benefits-box li {
      color: #555555;
      margin: 12px 0;
      line-height: 1.8;
      font-size: 15px;
    }
    .footer { 
      background: #1a1a1a;
      color: #ffffff;
      text-align: center; 
      padding: 30px;
    }
    .footer p {
      margin: 10px 0;
      font-size: 14px;
      color: #cccccc;
    }
    .footer a {
      color: #c8a951;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background: #e0e0e0;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Bienvenido a StayAway Rifas</h1>
      <p>Tu cuenta ha sido creada exitosamente</p>
    </div>
    
    <div class="content">
      <h2>Estimado/a ${usuario.nombres} ${usuario.apellidos},</h2>
      <p>Te damos la bienvenida a nuestra plataforma de rifas. Tu cuenta ha sido creada automáticamente durante tu compra para que puedas gestionar tus participaciones de forma segura.</p>
      
      <div class="credentials-box">
        <h3>Credenciales de Acceso</h3>
        
        <div class="credential-row">
          <span class="credential-label">Correo Electrónico:</span>
          <div class="credential-value">${usuario.correo_electronico}</div>
        </div>

        <div class="credential-row">
          <span class="credential-label">Contraseña Temporal:</span>
          <div class="password-box">
            <div class="password-value">${passwordPlana}</div>
          </div>
        </div>

        <div class="warning-box">
          <p><span class="warning-icon">⚠</span> <strong>IMPORTANTE:</strong> Guarda esta contraseña en un lugar seguro.</p>
          <p>Te recomendamos cambiarla cuando ingreses por primera vez a tu cuenta.</p>
        </div>
      </div>

      <div class="login-box">
        <p>Accede a tu cuenta para ver tus números y gestionar tu perfil:</p>
        <a href="${process.env.FRONTEND_URL}/login" class="login-button">Iniciar Sesión</a>
      </div>

      <div class="benefits-box">
        <h3>¿Qué puedes hacer en tu cuenta?</h3>
        <ul>
          <li>Ver todos tus números comprados en tiempo real</li>
          <li>Consultar el estado de tus rifas activas</li>
          <li>Actualizar tu información personal y de contacto</li>
          <li>Cambiar tu contraseña por una personalizada</li>
          <li>Recibir notificaciones sobre sorteos y resultados</li>
          <li>Participar en nuevas rifas de forma rápida</li>
        </ul>
      </div>

      <div class="divider"></div>

      <p style="color: #666666; font-size: 14px; text-align: center;">
        Si tienes alguna dificultad para acceder a tu cuenta, no dudes en contactarnos. Estamos aquí para ayudarte.
      </p>
    </div>
    
    <div class="footer">
      <p style="font-weight: 600; font-size: 16px; color: #c8a951;">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Soporte: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
    </div>
  </div>
</body>
</html>
  `;
};

const generarTemplateRecuperacion = (usuario, resetUrl) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Restablecer Contraseña</h1>
      <p>Solicitud de recuperación de cuenta</p>
    </div>
    <div class="content">
      <h2>Hola ${usuario.nombres},</h2>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en StayAway Rifas.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
      </div>

      <div class="warning">
        <p><strong>⚠️ IMPORTANTE:</strong></p>
        <p>Este enlace expirará en 1 hora por seguridad.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>

      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all; color: #666;">${resetUrl}</p>
    </div>
    <div class="footer">
      <p>StayAway Rifas - Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Si tienes alguna pregunta, contáctanos en soporte@stayaway.com.co</p>
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
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.6; 
      color: #333333; 
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container { 
      max-width: 600px; 
      margin: 30px auto; 
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
    .header { 
      background: linear-gradient(135deg, #c8a951 0%, #dfc77a 100%); 
      color: #ffffff; 
      padding: 50px 30px; 
      text-align: center;
    }
    .header h1 {
      margin: 0 0 15px 0;
      font-size: 32px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .header p {
      margin: 0;
      font-size: 18px;
      opacity: 0.95;
    }
    .content { 
      padding: 40px 30px;
    }
    .winner-banner {
      background: linear-gradient(135deg, #fff9e6 0%, #ffffff 100%);
      border: 3px solid #c8a951;
      border-radius: 12px;
      padding: 30px;
      text-align: center;
      margin: 30px 0;
    }
    .winner-number {
      font-size: 48px;
      font-weight: 900;
      color: #c8a951;
      font-family: 'Courier New', monospace;
      margin: 20px 0;
      letter-spacing: 3px;
    }
    .winner-label {
      font-size: 14px;
      color: #666666;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .info-box {
      background: #f8f9fa;
      border-left: 4px solid #c8a951;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .info-box h3 {
      color: #c8a951;
      font-size: 18px;
      margin: 0 0 15px 0;
      font-weight: 600;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #666666;
      font-weight: 600;
    }
    .info-value {
      color: #1a1a1a;
      font-weight: 700;
    }
    .instructions-box {
      background: #e3f2fd;
      border: 2px solid #2196f3;
      border-radius: 8px;
      padding: 25px;
      margin: 25px 0;
    }
    .instructions-box h3 {
      color: #1976d2;
      font-size: 18px;
      margin: 0 0 15px 0;
    }
    .instructions-box ol {
      margin: 15px 0;
      padding-left: 20px;
    }
    .instructions-box li {
      color: #424242;
      margin: 10px 0;
      line-height: 1.8;
    }
    .footer { 
      background: #1a1a1a;
      color: #ffffff;
      text-align: center; 
      padding: 30px;
    }
    .footer p {
      margin: 10px 0;
      font-size: 14px;
      color: #cccccc;
    }
    .footer a {
      color: #c8a951;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background: #e0e0e0;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>¡Felicidades!</h1>
      <p>Eres el ganador de nuestra rifa</p>
    </div>
    
    <div class="content">
      <h2 style="color: #1a1a1a; font-size: 24px;">Estimado/a ${ganador.nombres} ${ganador.apellidos},</h2>
      <p style="font-size: 16px; color: #555555;">Nos complace enormemente informarte que has resultado ganador/a de nuestra rifa. Este es un momento especial y queremos asegurarnos de que tengas toda la información necesaria.</p>
      
      <div class="winner-banner">
        <p class="winner-label">Número Ganador</p>
        <div class="winner-number">#${numeroGanador}</div>
      </div>

      <div class="info-box">
        <h3>Información de la Rifa</h3>
        <div class="info-row">
          <span class="info-label">Rifa:</span>
          <span class="info-value">${rifa.titulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha del sorteo:</span>
          <span class="info-value">${new Date(rifa.fecha_sorteo).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        ${loteriaReferencia ? `
        <div class="info-row">
          <span class="info-label">Lotería de referencia:</span>
          <span class="info-value">${loteriaReferencia}</span>
        </div>
        ` : ''}
      </div>

      <div class="instructions-box">
        <h3>Próximos Pasos para Reclamar tu Premio</h3>
        <ol>
          <li>Conserva este correo como comprobante de tu premio.</li>
          <li>Nuestro equipo se pondrá en contacto contigo en las próximas 48 horas hábiles.</li>
          <li>Deberás presentar tu documento de identidad original para verificación.</li>
          <li>El proceso de entrega del premio se coordinará según la disponibilidad de ambas partes.</li>
          <li>Para cualquier consulta, puedes comunicarte con nosotros a través de nuestros canales oficiales.</li>
        </ol>
      </div>

      <div class="divider"></div>

      <p style="color: #666666; font-size: 14px; text-align: center;">
        Te agradecemos por tu participación y confianza en StayAway Rifas. Esperamos que disfrutes tu premio.
      </p>
    </div>
    
    <div class="footer">
      <p style="font-weight: 600; font-size: 16px; color: #c8a951;">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Contacto: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
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
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.6; 
      color: #333333; 
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container { 
      max-width: 600px; 
      margin: 30px auto; 
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
    .header { 
      background: linear-gradient(135deg, #c8a951 0%, #dfc77a 100%); 
      color: #ffffff; 
      padding: 40px 30px; 
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .content { 
      padding: 40px 30px;
    }
    .content h2 {
      color: #1a1a1a;
      font-size: 22px;
      margin: 0 0 20px 0;
    }
    .content p {
      color: #555555;
      font-size: 15px;
      margin: 15px 0;
    }
    .winner-box {
      background: linear-gradient(135deg, #fff9e6 0%, #ffffff 100%);
      border: 2px solid #c8a951;
      border-radius: 12px;
      padding: 25px;
      text-align: center;
      margin: 25px 0;
    }
    .winner-box h3 {
      color: #c8a951;
      margin: 0 0 15px 0;
      font-size: 18px;
    }
    .winner-number {
      font-size: 36px;
      font-weight: 900;
      color: #c8a951;
      font-family: 'Courier New', monospace;
      margin: 15px 0;
      letter-spacing: 2px;
    }
    .info-box {
      background: #f8f9fa;
      border-left: 4px solid #c8a951;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .info-box h3 {
      color: #c8a951;
      font-size: 18px;
      margin: 0 0 15px 0;
      font-weight: 600;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #666666;
      font-weight: 600;
    }
    .info-value {
      color: #1a1a1a;
      font-weight: 700;
    }
    .numbers-section {
      margin: 30px 0;
    }
    .numbers-section h3 {
      color: #1a1a1a;
      font-size: 18px;
      margin: 0 0 15px 0;
    }
    .numbers-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); 
      gap: 8px; 
      margin: 15px 0;
    }
    .number { 
      background: #f8f9fa;
      border: 2px solid #e0e0e0; 
      border-radius: 6px; 
      padding: 10px; 
      text-align: center; 
      font-weight: 600; 
      font-size: 14px;
      color: #666666;
      font-family: 'Courier New', monospace;
    }
    .thanks-box {
      background: #e8f5e9;
      border: 2px solid #4caf50;
      border-radius: 8px;
      padding: 25px;
      text-align: center;
      margin: 25px 0;
    }
    .thanks-box p {
      color: #2e7d32;
      font-weight: 600;
      font-size: 16px;
      margin: 0;
    }
    .footer { 
      background: #1a1a1a;
      color: #ffffff;
      text-align: center; 
      padding: 30px;
    }
    .footer p {
      margin: 10px 0;
      font-size: 14px;
      color: #cccccc;
    }
    .footer a {
      color: #c8a951;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background: #e0e0e0;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rifa Sorteada</h1>
      <p>Resultados oficiales del sorteo</p>
    </div>
    
    <div class="content">
      <h2>Estimado/a ${usuario.nombres} ${usuario.apellidos},</h2>
      <p>Te informamos que el sorteo de la rifa en la que participaste ha sido realizado exitosamente. A continuación te presentamos los resultados oficiales:</p>
      
      <div class="winner-box">
        <h3>Número Ganador</h3>
        <div class="winner-number">#${numeroGanador}</div>
      </div>

      <div class="info-box">
        <h3>Información del Sorteo</h3>
        <div class="info-row">
          <span class="info-label">Rifa:</span>
          <span class="info-value">${rifa.titulo}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Fecha del sorteo:</span>
          <span class="info-value">${new Date(rifa.fecha_sorteo).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        ${loteriaReferencia ? `
        <div class="info-row">
          <span class="info-label">Lotería de referencia:</span>
          <span class="info-value">${loteriaReferencia}</span>
        </div>
        ` : ''}
      </div>

      <div class="numbers-section">
        <h3>Tus Números Participantes</h3>
        <div class="numbers-grid">
          ${numerosUsuario.slice(0, 20).map(numero => `<div class="number">#${numero}</div>`).join('')}
        </div>
        ${numerosUsuario.length > 20 ? `<p style="text-align: center; color: #666666; font-size: 14px;">Y ${numerosUsuario.length - 20} números más...</p>` : ''}
      </div>

      <div class="divider"></div>

      <div class="thanks-box">
        <p>Gracias por tu participación. Te invitamos a estar atento a nuestras próximas rifas.</p>
      </div>

      <p style="color: #666666; font-size: 14px; text-align: center;">
        Puedes seguir nuestras redes sociales para enterarte de futuros sorteos y promociones especiales.
      </p>
    </div>
    
    <div class="footer">
      <p style="font-weight: 600; font-size: 16px; color: #c8a951;">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Contacto: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
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
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      line-height: 1.6; 
      color: #333333; 
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container { 
      max-width: 600px; 
      margin: 30px auto; 
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
    .header { 
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); 
      color: #ffffff; 
      padding: 40px 30px; 
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .content { 
      padding: 40px 30px;
    }
    .content h2 {
      color: #1a1a1a;
      font-size: 22px;
      margin: 0 0 20px 0;
    }
    .content p {
      color: #555555;
      font-size: 15px;
      margin: 15px 0;
    }
    .alert-box {
      background: #fff3cd;
      border: 2px solid #ffc107;
      border-radius: 12px;
      padding: 25px;
      margin: 25px 0;
    }
    .alert-box h3 {
      color: #856404;
      font-size: 18px;
      margin: 0 0 15px 0;
      font-weight: 600;
    }
    .alert-box p {
      color: #856404;
      margin: 10px 0;
    }
    .numero-sorteado {
      font-size: 36px;
      font-weight: 900;
      color: #ff9800;
      font-family: 'Courier New', monospace;
      text-align: center;
      margin: 20px 0;
      letter-spacing: 2px;
    }
    .new-date-box {
      background: linear-gradient(135deg, #e8f5e9 0%, #f1f8f4 100%);
      border: 2px solid #4caf50;
      border-radius: 12px;
      padding: 25px;
      text-align: center;
      margin: 25px 0;
    }
    .new-date-box h3 {
      color: #4caf50;
      font-size: 18px;
      margin: 0 0 15px 0;
    }
    .new-date {
      font-size: 20px;
      font-weight: 700;
      color: #2e7d32;
      margin: 15px 0;
    }
    .info-box {
      background: #f8f9fa;
      border-left: 4px solid #ff9800;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
    }
    .info-box h3 {
      color: #ff9800;
      font-size: 18px;
      margin: 0 0 15px 0;
      font-weight: 600;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #666666;
      font-weight: 600;
    }
    .info-value {
      color: #1a1a1a;
      font-weight: 700;
    }
    .numbers-section {
      margin: 30px 0;
    }
    .numbers-section h3 {
      color: #1a1a1a;
      font-size: 18px;
      margin: 0 0 15px 0;
    }
    .numbers-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); 
      gap: 8px; 
      margin: 15px 0;
    }
    .number { 
      background: #f8f9fa;
      border: 2px solid #e0e0e0; 
      border-radius: 6px; 
      padding: 10px; 
      text-align: center; 
      font-weight: 600; 
      font-size: 14px;
      color: #666666;
      font-family: 'Courier New', monospace;
    }
    .footer { 
      background: #1a1a1a;
      color: #ffffff;
      text-align: center; 
      padding: 30px;
    }
    .footer p {
      margin: 10px 0;
      font-size: 14px;
      color: #cccccc;
    }
    .footer a {
      color: #c8a951;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background: #e0e0e0;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Sorteo Sin Ganador</h1>
      <p>Información importante sobre el sorteo</p>
    </div>
    
    <div class="content">
      <h2>Estimado/a ${usuario.nombres} ${usuario.apellidos},</h2>
      <p>Te informamos que se ha realizado el sorteo de la rifa en la que participaste. Sin embargo, el número sorteado no fue adquirido por ningún participante.</p>
      
      <div class="alert-box">
        <h3>Número Sorteado (No Vendido)</h3>
        <div class="numero-sorteado">#${numeroSorteado}</div>
        <p>Este número no tiene comprador asignado, por lo que se procederá a un nuevo sorteo.</p>
      </div>

      <div class="new-date-box">
        <h3>Nuevo Sorteo Programado</h3>
        <p>La nueva fecha para el sorteo es:</p>
        <div class="new-date">${fechaFormateada}</div>
      </div>

      <div class="info-box">
        <h3>Información del Sorteo</h3>
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
        <h3>Tus Números Siguen Participando</h3>
        <div class="numbers-grid">
          ${numerosUsuario.slice(0, 20).map(numero => `<div class="number">#${numero}</div>`).join('')}
        </div>
        ${numerosUsuario.length > 20 ? `<p style="text-align: center; color: #666666; font-size: 14px;">Y ${numerosUsuario.length - 20} números más...</p>` : ''}
      </div>

      <div class="divider"></div>

      <p style="color: #2e7d32; font-weight: 600; text-align: center; font-size: 16px;">
        Tus números siguen activos y participarán en el nuevo sorteo programado. ¡Mucha suerte!
      </p>

      <p style="color: #666666; font-size: 14px; text-align: center;">
        Estaremos atentos para informarte sobre los resultados del nuevo sorteo.
      </p>
    </div>
    
    <div class="footer">
      <p style="font-weight: 600; font-size: 16px; color: #c8a951;">StayAway Rifas</p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>Contacto: <a href="mailto:soporte@stayaway.com.co">soporte@stayaway.com.co</a></p>
    </div>
  </div>
</body>
</html>
  `;
};
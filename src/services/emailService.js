import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Enviar correo de confirmación de compra
 */
export const enviarCorreoCompraExitosa = async (usuario, transaccion, numerosAsignados) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <onboarding@resend.dev>',
      to: usuario.correo_electronico,
      subject: `🎉 ¡Compra Exitosa! - ${transaccion.rifaTitulo}`,
      html: generarTemplateCompra(usuario, transaccion, numerosAsignados),
    });

    if (error) {
      console.error('❌ Error Resend:', error);
      return { success: false, error };
    }

    console.log('✅ Correo de compra enviado:', data.id);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Error enviando correo de compra:', error);
    return { success: false, error };
  }
};

/**
 * Enviar correo con contraseña a usuario nuevo
 */
export const enviarCorreoBienvenida = async (usuario, passwordPlana) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <onboarding@resend.dev>',
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
      from: 'StayAway Rifas <onboarding@resend.dev>',
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
 * Templates de correo
 */
const generarTemplateCompra = (usuario, transaccion, numerosAsignados) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .numbers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; margin: 20px 0; }
    .number { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 15px; text-align: center; font-weight: bold; font-size: 16px; }
    .success { color: #10b981; font-weight: bold; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 ¡Compra Exitosa!</h1>
      <p>Gracias por participar en nuestra rifa</p>
    </div>
    <div class="content">
      <h2>Hola ${usuario.nombres} ${usuario.apellidos},</h2>
      <p>Tu compra ha sido procesada exitosamente. Aquí tienes los detalles:</p>
      
      <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3>📋 Detalles de la Compra</h3>
        <p><strong>Rifa:</strong> ${transaccion.rifaTitulo}</p>
        <p><strong>Cantidad de números:</strong> ${transaccion.cantidad}</p>
        <p><strong>Total pagado:</strong> $${transaccion.total.toLocaleString()}</p>
        <p><strong>Referencia:</strong> ${transaccion.referencia}</p>
        <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-CO')}</p>
      </div>

      <h3>🎯 Tus Números Asignados</h3>
      <div class="numbers-grid">
        ${numerosAsignados.map(numero => `
          <div class="number">#${numero}</div>
        `).join('')}
      </div>

      <p class="success">¡Buena suerte! Los resultados se publicarán en nuestras redes sociales.</p>
      
      <p>Puedes ver tus números en cualquier momento accediendo a tu perfil en nuestra plataforma.</p>
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

const generarTemplateBienvenida = (usuario, passwordPlana) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .password-box { background: white; border: 2px dashed #10b981; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; font-family: monospace; font-size: 18px; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👋 ¡Bienvenido a StayAway Rifas!</h1>
      <p>Tu cuenta ha sido creada exitosamente</p>
    </div>
    <div class="content">
      <h2>Hola ${usuario.nombres} ${usuario.apellidos},</h2>
      <p>Te damos la bienvenida a nuestra plataforma de rifas. Tu cuenta ha sido creada automáticamente durante tu compra.</p>
      
      <div class="warning">
        <h3>🔐 Tus Credenciales de Acceso</h3>
        <p><strong>Correo electrónico:</strong> ${usuario.correo_electronico}</p>
        <p><strong>Contraseña temporal:</strong></p>
        <div class="password-box">${passwordPlana}</div>
        <p><strong>⚠️ IMPORTANTE:</strong> Guarda esta contraseña en un lugar seguro. Te recomendamos cambiarla cuando ingreses por primera vez.</p>
      </div>

      <p>Puedes acceder a tu cuenta en: <a href="${process.env.FRONTEND_URL}/login">${process.env.FRONTEND_URL}/login</a></p>
      
      <p>En tu perfil podrás:</p>
      <ul>
        <li>✅ Ver todos tus números comprados</li>
        <li>✅ Actualizar tu información personal</li>
        <li>✅ Cambiar tu contraseña</li>
        <li>✅ Participar en más rifas</li>
      </ul>
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
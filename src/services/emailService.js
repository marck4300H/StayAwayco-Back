import { Resend } from 'resend';

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
 * Enviar correo de confirmación de compra
 */
export const enviarCorreoCompraExitosa = async (usuario, transaccion, numerosAsignados) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
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
 * 📧 Enviar correo a PARTICIPANTES (no ganadores)
 */
export const enviarCorreoParticipantes = async (usuario, rifa, numeroGanador, numerosUsuario, loteriaReferencia) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'StayAway Rifas <noreply@stayaway.com.co>',
      to: usuario.correo_electronico,
      subject: `🎲 Rifa Sorteada - ${rifa.titulo}`,
      html: generarTemplateParticipantes(usuario, rifa, numeroGanador, numerosUsuario, loteriaReferencia),
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
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000; padding: 40px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 32px; }
    .trophy { font-size: 80px; margin: 20px 0; }
    .content { padding: 40px 30px; }
    .winner-box { background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); border: 3px solid #FFA500; border-radius: 15px; padding: 30px; text-align: center; margin: 30px 0; }
    .winner-number { font-size: 48px; font-weight: bold; color: #000; margin: 20px 0; font-family: monospace; letter-spacing: 5px; }
    .info-box { background: #f9f9f9; border-left: 4px solid #FFD700; padding: 20px; margin: 20px 0; }
    .next-steps { background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; background: #f9f9f9; }
    ul { padding-left: 20px; }
    li { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="trophy">🏆</div>
      <h1>¡FELICIDADES!</h1>
      <p style="font-size: 20px; margin: 10px 0;">¡HAS GANADO!</p>
    </div>
    
    <div class="content">
      <h2>Hola ${ganador.nombres} ${ganador.apellidos},</h2>
      
      <p style="font-size: 18px;"><strong>¡Tenemos excelentes noticias para ti!</strong></p>
      
      <div class="winner-box">
        <p style="margin: 0; font-size: 16px;">Tu número ganador</p>
        <div class="winner-number">#${numeroGanador}</div>
        <p style="margin: 0; font-size: 18px; font-weight: bold;">¡Resultó GANADOR en la rifa!</p>
      </div>

      <div class="info-box">
        <h3 style="margin-top: 0;">📋 Detalles del Premio</h3>
        <p><strong>Rifa:</strong> ${rifa.titulo}</p>
        <p><strong>Número Ganador:</strong> #${numeroGanador}</p>
        ${loteriaReferencia ? `<p><strong>Lotería:</strong> ${loteriaReferencia}</p>` : ''}
        <p><strong>Fecha del sorteo:</strong> ${new Date().toLocaleDateString('es-CO', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</p>
      </div>

      <div class="next-steps">
        <h3 style="margin-top: 0;">📞 ¿Qué sigue ahora?</h3>
        <p>Nuestro equipo se pondrá en contacto contigo en las <strong>próximas 48 horas</strong> para coordinar la entrega de tu premio.</p>
        
        <p><strong>Por favor, asegúrate de:</strong></p>
        <ul>
          <li>✅ Tener tu documento de identidad a la mano (${ganador.tipo_documento || 'CC'} ${ganador.numero_documento})</li>
          <li>✅ Responder nuestras llamadas al teléfono registrado</li>
          <li>✅ Revisar tu correo electrónico regularmente</li>
          <li>✅ Estar pendiente de WhatsApp para coordinar detalles</li>
        </ul>
      </div>

      <p style="text-align: center; font-size: 18px; color: #FFA500; font-weight: bold;">
        ¡Felicitaciones una vez más!
      </p>
      
      <p style="text-align: center; color: #666;">
        Si tienes alguna pregunta, no dudes en contactarnos.
      </p>
    </div>

    <div class="footer">
      <p><strong>StayAway Rifas</strong></p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>📧 soporte@stayaway.com.co | 📱 WhatsApp: +57 300 123 4567</p>
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
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
    .content { padding: 30px; }
    .winner-box { background: #f0f0f0; border: 2px solid #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
    .winner-number { font-size: 36px; font-weight: bold; color: #667eea; margin: 15px 0; font-family: monospace; letter-spacing: 3px; }
    .numbers-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 8px; margin: 20px 0; }
    .number { background: white; border: 2px solid #e0e0e0; border-radius: 8px; padding: 12px; text-align: center; font-weight: bold; font-size: 14px; font-family: monospace; }
    .info-box { background: #f9f9f9; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
    .cta-box { background: #e8f5e9; border: 2px solid #4caf50; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; background: #f9f9f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎲 Rifa Sorteada</h1>
      <p style="font-size: 18px; margin: 10px 0;">${rifa.titulo}</p>
    </div>
    
    <div class="content">
      <h2>Hola ${usuario.nombres} ${usuario.apellidos},</h2>
      
      <p>Te informamos que la rifa <strong>"${rifa.titulo}"</strong> ha sido sorteada.</p>

      <div class="winner-box">
        <p style="margin: 0; font-size: 14px; color: #666;">🏆 Número Ganador</p>
        <div class="winner-number">#${numeroGanador}</div>
        ${loteriaReferencia ? `<p style="margin: 5px 0; font-size: 13px; color: #666;">${loteriaReferencia}</p>` : ''}
      </div>

      ${numerosUsuario.length > 0 ? `
        <div class="info-box">
          <h3 style="margin-top: 0;">🎯 Tus Números Participantes</h3>
          <div class="numbers-grid">
            ${numerosUsuario.slice(0, 20).map(num => `<div class="number">#${num}</div>`).join('')}
            ${numerosUsuario.length > 20 ? `<div class="number" style="border: none; background: transparent; color: #666;">+${numerosUsuario.length - 20} más</div>` : ''}
          </div>
        </div>
      ` : ''}

      <p>Aunque en esta ocasión no resultaste ganador, queremos agradecerte de corazón por tu participación y confianza en StayAway Rifas.</p>

      <div class="cta-box">
        <h3 style="margin-top: 0; color: #4caf50;">🎁 ¡Mantente Atento!</h3>
        <p>Pronto tendremos nuevas rifas con increíbles premios.</p>
        <p style="margin: 0;"><strong>¡La próxima puede ser tuya!</strong></p>
      </div>

      <p style="text-align: center; color: #666;">
        Gracias por ser parte de nuestra comunidad.
      </p>
    </div>

    <div class="footer">
      <p><strong>StayAway Rifas</strong></p>
      <p>Todos los derechos reservados © ${new Date().getFullYear()}</p>
      <p>📧 soporte@stayaway.com.co | 🌐 www.stayaway.com.co</p>
    </div>
  </div>
</body>
</html>
  `;
};

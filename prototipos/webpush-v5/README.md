# GridVision V5.1 - Web Push

ESTADO: PROTOTIPO VALIDADO. NO PRODUCCION.

VALIDACIONES:
- Windows con Portal cerrado.
- Windows con ventanas de Edge cerradas.
- Android Redmi mediante HTTPS.
- Registro protegido de dispositivos.
- Firma VAPID y envio Web Push.

PENDIENTES:
- Servidor permanente 24/7.
- Persistencia de dispositivos y eventos.
- Integracion PFV y SITR.
- Alertas meteorologicas por activo.
- Alertas SENAPRED georreferenciadas.
- Selector de activos e historial.

CRITERIOS EOLICOS:
- Alerta preventiva desde 20 m/s.
- PEVP: ajuste de parada de 25 m/s.
- Considerar efecto estela en PEVP.
- Diferenciar viento promedio, rafagas y parada efectiva.
- Confirmar ajuste definitivo PECN.

SEGURIDAD:
- No guardar claves privadas en Git.
- No guardar codigos de registro.
- No guardar suscripciones de dispositivos.
- Uso exclusivo de pruebas.
- No exponer el servidor de prueba Windows a Internet.

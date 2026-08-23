/**
 * Every Spanish text the interface shows lives here.
 *
 * Keys are English because they are code; values are Spanish because they are what a person
 * reads. No Spanish literal is written anywhere else, not in a component and not in
 * index.html: the markup carries data-label attributes and the text is applied from here.
 *
 * The ERRORS group is the one exception to "never invent a message on the client", and it is
 * deliberately narrow: it only covers the cases where there is no API answer to show, plus
 * the optional checks the forms run before sending anything. Whenever the API does answer,
 * its own message is what the user sees.
 */

export const LABELS = Object.freeze({
  PAGE_TITLE: "Sistema de Parqueaderos",
  APP_TITLE: "Sistema de Parqueaderos",
  APP_SUBTITLE: "Control de ingreso y salida de vehículos",

  AVAILABILITY: Object.freeze({
    TITLE: "Disponibilidad",
    CAPACITY: "Capacidad total",
    OCCUPIED: "Ocupados",
    AVAILABLE: "Disponibles",
    FULL_BADGE: "Parqueadero lleno",
  }),

  ENTRY_FORM: Object.freeze({
    TITLE: "Registrar ingreso",
    PLATE_LABEL: "Placa",
    PLATE_PLACEHOLDER: "ABC123",
    PLATE_HINT: "Automóviles y camiones: AAA123. Motocicletas: AAA12A.",
    VEHICLE_TYPE_LABEL: "Tipo de vehículo",
    VEHICLE_TYPE_PLACEHOLDER: "Seleccione un tipo",
    SUBMIT: "Registrar ingreso",
    SUBMITTING: "Registrando...",
    BLOCKED_WHEN_FULL: "El parqueadero está lleno, no se pueden registrar ingresos",
  }),

  EXIT_FORM: Object.freeze({
    TITLE: "Registrar salida",
    PLATE_LABEL: "Placa",
    PLATE_PLACEHOLDER: "ABC123",
    SUBMIT: "Registrar salida",
    SUBMITTING: "Procesando...",
  }),

  RECEIPT: Object.freeze({
    TITLE: "Recibo de pago",
    PLATE: "Placa",
    VEHICLE_TYPE: "Tipo de vehículo",
    ENTRY_TIME: "Hora de ingreso",
    EXIT_TIME: "Hora de salida",
    STAY: "Permanencia",
    BILLABLE_HOURS: "Horas cobradas",
    HOURLY_RATE: "Tarifa por hora",
    TOTAL: "Total a pagar",
    GRACE_NOTICE: "La permanencia estuvo dentro del periodo de gracia, no genera cobro",
    CLOSE: "Cerrar recibo",
  }),

  PARKED_TABLE: Object.freeze({
    TITLE: "Vehículos estacionados",
    PLATE: "Placa",
    VEHICLE_TYPE: "Tipo",
    ENTRY_TIME: "Hora de ingreso",
    ELAPSED: "Tiempo transcurrido",
    EMPTY: "No hay vehículos dentro del parqueadero",
  }),

  ALERT: Object.freeze({
    CLOSE: "Cerrar mensaje",
  }),

  ERRORS: Object.freeze({
    NETWORK_UNAVAILABLE: "No se pudo conectar con el servidor. Verifique que esté encendido",
    REQUEST_TIMEOUT: "El servidor tardó demasiado en responder. Intente nuevamente",
    UNEXPECTED_RESPONSE: "La respuesta del servidor no tiene el formato esperado",
    PLATE_REQUIRED: "La placa es obligatoria",
    PLATE_INVALID_FORMAT: "La placa no tiene un formato válido",
    VEHICLE_TYPE_REQUIRED: "Debe seleccionar un tipo de vehículo",
  }),

  COMMON: Object.freeze({
    LOADING: "Cargando...",
    CONNECTION_VERIFIED: "Conexión con la API verificada correctamente",
  }),
});

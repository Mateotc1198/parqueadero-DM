/**
 * Every Spanish text the API returns lives here.
 *
 * Keys are English because they are code; values are Spanish because they are what a
 * person reads. No Spanish literal may be written inline inside a controller, a service
 * or a validator: it is always imported from this file.
 */

export const SUCCESS_MESSAGES = Object.freeze({
  ENTRY_REGISTERED: "Ingreso registrado correctamente",
  EXIT_REGISTERED: "Salida registrada correctamente",
  PARKED_VEHICLES_RETRIEVED: "Vehículos estacionados consultados correctamente",
  VEHICLE_RETRIEVED: "Vehículo consultado correctamente",
  AVAILABILITY_RETRIEVED: "Disponibilidad consultada correctamente",
  HISTORY_RETRIEVED: "Historial consultado correctamente",
  VEHICLE_TYPES_RETRIEVED: "Tipos de vehículo consultados correctamente",
  SERVICE_HEALTHY: "El servicio se encuentra operativo",
});

export const ERROR_MESSAGES = Object.freeze({
  // Generic
  VALIDATION_FAILED: "Los datos ingresados no son válidos",
  INTERNAL_ERROR: "Ocurrió un error inesperado. Intente nuevamente",
  ROUTE_NOT_FOUND: "La ruta solicitada no existe",
  SERVICE_UNHEALTHY: "El servicio no puede conectarse a la base de datos",

  // Business rules
  PLATE_ALREADY_PARKED: "Ya existe un vehículo con esta placa dentro del parqueadero",
  PARKING_LOT_FULL: "El parqueadero se encuentra lleno",
  VEHICLE_NOT_FOUND: "No se encontró un vehículo activo con esta placa",
  EXIT_BEFORE_ENTRY: "La hora de salida no puede ser anterior a la hora de entrada",
  VEHICLE_TYPE_NOT_FOUND: "El tipo de vehículo no está registrado en el catálogo",

  // Required fields
  BODY_REQUIRED: "El cuerpo de la petición no puede estar vacío",
  MALFORMED_JSON: "El cuerpo de la petición no es un JSON válido",
  PLATE_REQUIRED: "La placa es obligatoria",
  VEHICLE_TYPE_REQUIRED: "El tipo de vehículo es obligatorio",

  // Format and allowed ranges
  PLATE_INVALID_FORMAT: "La placa no tiene un formato válido",
  VEHICLE_TYPE_INVALID: "El tipo de vehículo seleccionado no es válido",
  INVALID_NUMBER: "El valor ingresado debe ser un número válido",
  INVALID_DATE: "La fecha ingresada no es válida",
  DATE_TIMEZONE_REQUIRED:
    "La fecha debe incluir la zona horaria, por ejemplo 2026-01-31T14:30:00Z",
  FUTURE_DATE: "La fecha no puede ser posterior a la hora actual",
  LIMIT_INVALID: "El límite debe ser un número entero mayor que cero",
  OFFSET_INVALID: "El desplazamiento debe ser un número entero mayor o igual a cero",
});

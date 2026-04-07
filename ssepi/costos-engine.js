// costos-engine.js - Motor de Cálculo Financiero Unificado V1
// Centraliza todas las fórmulas para ventas, facturación y análisis.

const CostosEngine = (function() {
    // ==========================================================================
    // 1. CONFIGURACIÓN BASE (TABULADOR)
    // ==========================================================================
    const CONFIG = {
        // Variables generales
        gasolina: 24.50,           // Precio por litro
        rendimiento: 9.5,           // Kilómetros por litro
        costoTecnico: 104.16,       // Costo por hora de técnico (Dani)
        gastosFijosHora: 124.18,     // Gastos fijos por hora (luz, renta, etc.)
        camionetaHora: 39.35,        // Costo de operación de camioneta por hora
        utilidad: 40,                // Porcentaje de utilidad deseado
        credito: 3,                   // Porcentaje por costo de crédito
        iva: 16                       // Porcentaje de IVA
    };

    // ==========================================================================
    // 2. FÓRMULAS BASE (Fieles al Excel Original)
    // ==========================================================================

    /**
     * Calcula los litros de gasolina necesarios para una distancia.
     * @param {number} km - Kilómetros de distancia.
     * @returns {number} Litros de gasolina.
     */
    function calcularLitros(km) {
        if (km <= 0) return 0;
        return km / CONFIG.rendimiento;
    }

    /**
     * Calcula el costo de la gasolina para una distancia.
     * @param {number} km - Kilómetros de distancia.
     * @returns {number} Costo de la gasolina.
     */
    function calcularCostoGasolina(km) {
        return calcularLitros(km) * CONFIG.gasolina;
    }

    /**
     * Calcula el costo de traslado del técnico (Dani).
     * @param {number} horasViaje - Horas de viaje (generalmente las horas del tabulador).
     * @returns {number} Costo de traslado.
     */
    function calcularCostoTrasladoTecnico(horasViaje) {
        return horasViaje * CONFIG.costoTecnico;
    }

    /**
     * Calcula la suma de Gasolina + Traslado (celda "Gas + Ventas").
     * @param {number} km - Kilómetros de distancia.
     * @param {number} horasViaje - Horas de viaje.
     * @returns {number} Total de gasolina más traslado.
     */
    function calcularGasolinaMasTraslado(km, horasViaje) {
        return calcularCostoGasolina(km) + calcularCostoTrasladoTecnico(horasViaje);
    }

    /**
     * Calcula el costo de la mano de obra en taller.
     * @param {number} horasTaller - Horas estimadas de reparación.
     * @returns {number} Costo de mano de obra.
     */
    function calcularManoObra(horasTaller) {
        return horasTaller * CONFIG.costoTecnico;
    }

    /**
     * Calcula los gastos fijos asociados a las horas de taller.
     * @param {number} horasTaller - Horas estimadas de reparación.
     * @returns {number} Gastos fijos.
     */
    function calcularGastosFijos(horasTaller) {
        return horasTaller * CONFIG.gastosFijosHora;
    }

    /**
     * Calcula el costo de uso de la camioneta para entrega.
     * @param {number} horasViaje - Horas de viaje de entrega.
     * @returns {number} Costo de camioneta.
     */
    function calcularCostoCamioneta(horasViaje) {
        return horasViaje * CONFIG.camionetaHora;
    }

    /**
     * Calcula los Gastos Generales (suma de todos los costos directos).
     * @param {number} gasolinaMasTraslado - Costo de gasolina + traslado técnico.
     * @param {number} manoObra - Costo de mano de obra.
     * @param {number} gastosFijos - Gastos fijos.
     * @param {number} refacciones - Costo total de refacciones (inventario + compra).
     * @param {number} camioneta - Costo de camioneta.
     * @returns {number} Total de Gastos Generales.
     */
    function calcularGastosGenerales(gasolinaMasTraslado, manoObra, gastosFijos, refacciones, camioneta) {
        return gasolinaMasTraslado + manoObra + gastosFijos + refacciones + camioneta;
    }

    /**
     * Calcula el precio de venta antes de crédito e IVA, aplicando el porcentaje de utilidad.
     * @param {number} gastosGenerales - Total de Gastos Generales.
     * @returns {number} Precio con utilidad.
     */
    function aplicarUtilidad(gastosGenerales) {
        return gastosGenerales * (1 + (CONFIG.utilidad / 100));
    }

    /**
     * Calcula el precio final antes de IVA, aplicando el costo de crédito.
     * @param {number} precioConUtilidad - Precio después de aplicar utilidad.
     * @returns {number} Precio final antes de IVA.
     */
    function aplicarCredito(precioConUtilidad) {
        return precioConUtilidad * (1 + (CONFIG.credito / 100));
    }

    /**
     * Calcula el IVA de un monto.
     * @param {number} monto - Monto base.
     * @returns {number} IVA.
     */
    function calcularIVA(monto) {
        return monto * (CONFIG.iva / 100);
    }

    /**
     * Calcula el total con IVA incluido.
     * @param {number} montoBase - Monto antes de IVA.
     * @returns {number} Total con IVA.
     */
    function calcularTotalConIVA(montoBase) {
        return montoBase * (1 + (CONFIG.iva / 100));
    }

    /**
     * Calcula el precio final completo en un solo paso.
     * @param {object} params - Parámetros de entrada.
     * @param {number} params.km - Kilómetros de distancia.
     * @param {number} params.horasViaje - Horas de viaje (tabulador).
     * @param {number} params.horasTaller - Horas de reparación.
     * @param {number} params.costoRefacciones - Costo total de refacciones.
     * @returns {object} Objeto con todos los resultados del cálculo.
     */
    function calcularPrecioFinal({ km, horasViaje, horasTaller, costoRefacciones }) {
        const gasolinaMasTraslado = calcularGasolinaMasTraslado(km, horasViaje);
        const manoObra = calcularManoObra(horasTaller);
        const gastosFijos = calcularGastosFijos(horasTaller);
        const camioneta = calcularCostoCamioneta(horasViaje);

        const gastosGenerales = calcularGastosGenerales(
            gasolinaMasTraslado,
            manoObra,
            gastosFijos,
            costoRefacciones,
            camioneta
        );

        const precioConUtilidad = aplicarUtilidad(gastosGenerales);
        const precioAntesIVA = aplicarCredito(precioConUtilidad);
        const iva = calcularIVA(precioAntesIVA);
        const totalConIVA = calcularTotalConIVA(precioAntesIVA);

        return {
            // Costos desglosados
            gasolina: calcularCostoGasolina(km),
            trasladoTecnico: calcularCostoTrasladoTecnico(horasViaje),
            gasolinaMasTraslado,
            manoObra,
            gastosFijos,
            camioneta,
            refacciones: costoRefacciones,
            gastosGenerales,
            // Precios
            precioConUtilidad,
            precioAntesIVA,
            iva,
            total: totalConIVA
        };
    }

    // ==========================================================================
    // 3. API PÚBLICA
    // ==========================================================================
    return {
        CONFIG,
        calcularLitros,
        calcularCostoGasolina,
        calcularCostoTrasladoTecnico,
        calcularGasolinaMasTraslado,
        calcularManoObra,
        calcularGastosFijos,
        calcularCostoCamioneta,
        calcularGastosGenerales,
        aplicarUtilidad,
        aplicarCredito,
        calcularIVA,
        calcularTotalConIVA,
        calcularPrecioFinal
    };
})();

// Exponer globalmente
window.CostosEngine = CostosEngine;
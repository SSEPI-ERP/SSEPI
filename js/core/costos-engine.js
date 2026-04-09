// ================================================
// ARCHIVO: costos-engine.js
// DESCRIPCIÓN: Motor de cálculo financiero unificado
// SEGURIDAD: No contiene datos sensibles, solo lógica de negocio
// ================================================

export const CostosEngine = (function() {
    // Configuración base (puede ser sobreescrita desde BD)
    const CONFIG = {
        gasolina: 24.50,
        rendimiento: 9.5,
        costoTecnico: 104.16,
        gastosFijosHora: 124.18,
        camionetaHora: 39.35,
        utilidad: 40,
        credito: 3,
        iva: 16
    };

    // ==================== FÓRMULAS BASE ====================
    function calcularLitros(km) {
        return km <= 0 ? 0 : km / CONFIG.rendimiento;
    }

    function calcularCostoGasolina(km) {
        return calcularLitros(km) * CONFIG.gasolina;
    }

    function calcularCostoTrasladoTecnico(horasViaje) {
        return horasViaje * CONFIG.costoTecnico;
    }

    function calcularGasolinaMasTraslado(km, horasViaje) {
        return calcularCostoGasolina(km) + calcularCostoTrasladoTecnico(horasViaje);
    }

    function calcularManoObra(horasTaller) {
        return horasTaller * CONFIG.costoTecnico;
    }

    function calcularGastosFijos(horasTaller) {
        return horasTaller * CONFIG.gastosFijosHora;
    }

    function calcularCostoCamioneta(horasViaje) {
        return horasViaje * CONFIG.camionetaHora;
    }

    function calcularGastosGenerales(gasolinaMasTraslado, manoObra, gastosFijos, refacciones, camioneta) {
        return gasolinaMasTraslado + manoObra + gastosFijos + refacciones + camioneta;
    }

    function aplicarUtilidad(gastosGenerales) {
        return gastosGenerales * (1 + CONFIG.utilidad / 100);
    }

    function aplicarCredito(precioConUtilidad) {
        return precioConUtilidad * (1 + CONFIG.credito / 100);
    }

    function calcularIVA(monto) {
        return monto * (CONFIG.iva / 100);
    }

    function calcularTotalConIVA(montoBase) {
        return montoBase * (1 + CONFIG.iva / 100);
    }

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
            gasolina: calcularCostoGasolina(km),
            trasladoTecnico: calcularCostoTrasladoTecnico(horasViaje),
            gasolinaMasTraslado,
            manoObra,
            gastosFijos,
            camioneta,
            refacciones: costoRefacciones,
            gastosGenerales,
            precioConUtilidad,
            precioAntesIVA,
            iva,
            total: totalConIVA
        };
    }

    /** Sobreescribe constantes desde BD / calculadora_costos (sin persistir en código). */
    function applyConfig(partial) {
        if (!partial || typeof partial !== 'object') return;
        Object.assign(CONFIG, partial);
    }

    // ==================== API PÚBLICA ====================
    return {
        CONFIG,
        applyConfig,
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

window.CostosEngine = CostosEngine;
// ================================================
// ARCHIVO: costos-engine.js
// DESCRIPCIÓN: Motor de cálculo financiero unificado
// BASADO EN: TABULADOR_DE_COTIZACIÓN.xlsx
// SEGURIDAD: No contiene datos sensibles, solo lógica de negocio
// ================================================

export const CostosEngine = (function() {
    // Configuración base según tabulador (valores pueden venir de BD)
    const CONFIG = {
        gasolina_precio_litro: 30.00,
        rendimiento_km_litro: 9.5,
        ventas_por_dia: 87.00,
        tiempo_invertido_hr: 80.00,
        gastos_fijos_hr: 161.85,
        camioneta_hr: 52.67,
        utilidad_base: 40,
        utilidad_premium: 45,
        credito: 3,
        iva: 16
    };

    // ==================== FÓRMULAS BASE (según tabulador) ====================
    // Fórmula: litros = (km * 2) / 9.5  (ida y vuelta)
    function calcularLitros(km) {
        return km <= 0 ? 0 : (km * 2) / CONFIG.rendimiento_km_litro;
    }

    // Fórmula: $ gasolina = litros * 30
    function calcularCostoGasolina(km) {
        const litros = calcularLitros(km);
        return litros * CONFIG.gasolina_precio_litro;
    }

    // Fórmula: $ ventas = días * 87
    function calcularCostoVentas(dias) {
        return dias * CONFIG.ventas_por_dia;
    }

    // Fórmula: $ técnico = horas * 80
    function calcularCostoTrasladoTecnico(horasViaje) {
        return horasViaje * CONFIG.tiempo_invertido_hr;
    }

    // Fórmula: gastos fijos = horas * 161.85
    function calcularGastosFijos(horasTaller) {
        return horasTaller * CONFIG.gastos_fijos_hr;
    }

    // Fórmula: camioneta = horas * 52.67
    function calcularCostoCamioneta(horasViaje) {
        return horasViaje * CONFIG.camioneta_hr;
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

    /** Carga configuración desde parametros_costos en BD */
    async function loadFromDatabase() {
        try {
            if (!window.supabase) return CONFIG;
            const { data, error } = await window.supabase
                .from('parametros_costos')
                .select('clave, valor');
            if (error || !data) return CONFIG;

            const params = {};
            data.forEach(p => {
                const key = p.clave === 'gasolina_precio_litro' ? 'gasolina_precio_litro' :
                           p.clave === 'ventas_por_dia' ? 'ventas_por_dia' :
                           p.clave === 'tiempo_invertido_hr' ? 'tiempo_invertido_hr' :
                           p.clave === 'gastos_fijos_hr' ? 'gastos_fijos_hr' :
                           p.clave === 'camioneta_hr' ? 'camioneta_hr' :
                           p.clave === 'utilidad_base' ? 'utilidad_base' :
                           p.clave === 'utilidad_premium' ? 'utilidad_premium' :
                           p.clave;
                if (key in CONFIG) {
                    params[key] = Number(p.valor);
                }
            });
            applyConfig(params);
            return CONFIG;
        } catch (e) {
            console.warn('[CostosEngine] Error cargando desde BD:', e);
            return CONFIG;
        }
    }

    // ==================== API PÚBLICA ====================
    return {
        CONFIG,
        applyConfig,
        loadFromDatabase,
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
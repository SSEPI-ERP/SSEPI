/**
 * deptos-helper.js — Mapeo entre nombres de departamento del wizard de Ventas
 * y slugs del CostosEngine.
 *
 * El wizard de Ventas usa etiquetas largas ("Laboratorio de Electrónica"),
 * mientras que CostosEngine y calculadoras.js usan slugs ("laboratorio").
 * Este helper centraliza el mapeo para evitar drift entre archivos.
 */
(function () {
    'use strict';

    var MAPA = {
        'Laboratorio de Electrónica': 'laboratorio',
        'Taller Motores': 'motores',
        'Automatización': 'automatizacion',
        'Suministros': 'suministros',
        'Soporte en Planta': 'soporte',
        'Servicios': 'automatizacion',
        // Variantes cortas y alternativas
        'Laboratorio': 'laboratorio',
        'Motores': 'motores',
        'Auto': 'automatizacion',
        'Servicios Auto': 'automatizacion',
        'Soporte': 'soporte'
    };

    window.DeptosHelper = {
        /**
         * Convierte la etiqueta del wizard de Ventas al slug del engine.
         * @param {string} label - Etiqueta completa (ej. "Taller Motores")
         * @returns {string} Slug (ej. "motores"); "laboratorio" por defecto
         */
        ventasToEngine: function (label) {
            if (!label) return 'laboratorio';
            return MAPA[label] || MAPA[Object.keys(MAPA).find(function (k) {
                return k.toLowerCase() === String(label).toLowerCase();
            })] || 'laboratorio';
        },

        /**
         * Convierte el slug del engine a la etiqueta del wizard de Ventas.
         * @param {string} slug - Slug (ej. "motores")
         * @returns {string} Etiqueta completa (ej. "Taller Motores"); "Laboratorio de Electrónica" por defecto
         */
        engineToVentas: function (slug) {
            if (!slug) return 'Laboratorio de Electrónica';
            var found = Object.keys(MAPA).find(function (k) { return MAPA[k] === slug; });
            return found || 'Laboratorio de Electrónica';
        },

        /**
         * Lista todas las etiquetas disponibles en el wizard de Ventas.
         * @returns {string[]}
         */
        listarEtiquetasVentas: function () {
            return [
                'Laboratorio de Electrónica',
                'Taller Motores',
                'Automatización',
                'Suministros',
                'Soporte en Planta',
                'Servicios'
            ];
        }
    };
})();

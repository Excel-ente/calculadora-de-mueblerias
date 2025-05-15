/**
 * Script para la Guía Interactiva de Costos de MUEBLES.
 * Adaptado de la versión para recetas.
 * Maneja la navegación por pasos, validación, cálculo de costos de materiales,
 * mano de obra, gastos fijos, precio final y exportación a PDF.
 *
 * DEPENDENCIAS (si se usa PDF, deben estar en el HTML o importadas):
 * - jsPDF library (https://github.com/parallax/jsPDF)
 * - jsPDF-AutoTable plugin (https://github.com/simonbengtsson/jsPDF-AutoTable)
 */
document.addEventListener('DOMContentLoaded', () => {

    // Verificación de Dependencias para PDF (Opcional pero recomendado)
    let jsPDF_is_loaded = (typeof jspdf !== 'undefined' && typeof jspdf.jsPDF !== 'undefined');
    let jsPDF_AutoTable_is_loaded = false;

    if (jsPDF_is_loaded) {
        try {
            const jsPdfInstance = new jspdf.jsPDF();
            if (typeof jsPdfInstance.autoTable === 'function') {
                jsPDF_AutoTable_is_loaded = true;
            } else {
                console.warn("Plugin jsPDF-AutoTable no cargado. Las tablas en PDF tendrán formato básico o no funcionarán.");
            }
        } catch(e) {
            console.error("Error al instanciar jsPDF para verificar AutoTable:", e);
            jsPDF_is_loaded = false;
        }
    } else {
        console.warn("Librería jsPDF no está cargada. La exportación a PDF no funcionará. Podés descargarla desde https://cdnjs.com/libraries/jspdf");
    }


    // ===================================================================
    // == FUNCIONES UTILITARIAS INTEGRADAS (adaptadas para MUEBLES) ==
    // ===================================================================
    const baseConversionFactorsMuebles = {
      kg:    { group: "weight", baseUnit: "g",    factor: 1000 },
      g:     { group: "weight", baseUnit: "g",    factor: 1 },
      m:     { group: "length", baseUnit: "m",    factor: 1 },
      cm:    { group: "length", baseUnit: "m",    factor: 0.01 },
      mm:    { group: "length", baseUnit: "m",    factor: 0.001 },
      varilla: {group: "length_discrete", baseUnit: "varilla", factor: 1},
      m2:    { group: "area",   baseUnit: "m2",   factor: 1 },
      placa: { group: "area_discrete", baseUnit: "placa", factor: 1},
      lt:    { group: "volume", baseUnit: "ml",   factor: 1000 },
      ml:    { group: "volume", baseUnit: "ml",   factor: 1 },
      unid:  { group: "discrete", baseUnit: "unid", factor: 1 },
      par:   { group: "discrete", baseUnit: "unid", factor: 2 },
      set:   { group: "discrete", baseUnit: "unid", factor: 1 }, // Simplificado, podría ser N
      rollo: { group: "length_discrete", baseUnit: "rollo", factor: 1}
    };

    const getUnitGroupMuebles = (unit) => {
        return baseConversionFactorsMuebles[unit]?.group || null;
    };
    
    const formatCurrency = (amount) => {
      if (isNaN(amount) || amount === null) return "$0.00";
      return amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const parseFloatInput = (value, allowNegative = false) => {
      if (value === null || value === undefined || String(value).trim() === "") return 0;
      const parsed = parseFloat(String(value).replace(',', '.'));
      if (isNaN(parsed)) return 0;
      return allowNegative ? parsed : (parsed < 0 ? 0 : parsed);
    };

    const parseIntInput = (value, min = 1) => {
      if (value === null || value === undefined || String(value).trim() === "") return min;
      const parsed = parseInt(String(value).replace(',', '.'), 10);
      const minimum = min === 0 ? 0 : (isNaN(min) ? 1 : min);
      return isNaN(parsed) || parsed < minimum ? minimum : parsed;
    };

    const areUnitsCompatibleMuebles = (unit1, unit2) => {
      if (!unit1 || !unit2) return false;
      const group1 = getUnitGroupMuebles(unit1);
      const group2 = getUnitGroupMuebles(unit2);
      if (group1 && group1.endsWith("_discrete")) {
          return group1 === group2 || (group2 === "discrete" && baseConversionFactorsMuebles[unit2]?.baseUnit === "unid");
      }
      if (group2 && group2.endsWith("_discrete")) {
          return group1 === group2 || (group1 === "discrete" && baseConversionFactorsMuebles[unit1]?.baseUnit === "unid");
      }
      return group1 === group2 && group1 !== null;
    };

    const getCompatibleUnitsForSelect = (purchasedUnitValue) => {
        const group = getUnitGroupMuebles(purchasedUnitValue);
        if (!group) return [purchasedUnitValue];

        const compatible = new Set(); // Usar Set para evitar duplicados
        for (const unitKey in baseConversionFactorsMuebles) {
            if (getUnitGroupMuebles(unitKey) === group) {
                compatible.add(unitKey);
            }
            if (group.endsWith("_discrete") && getUnitGroupMuebles(unitKey) === "discrete" && baseConversionFactorsMuebles[unitKey].baseUnit === "unid") {
                compatible.add(unitKey);
            }
            if (group === "discrete" && baseConversionFactorsMuebles[purchasedUnitValue].baseUnit === "unid" && getUnitGroupMuebles(unitKey)?.endsWith("_discrete")) {
                 compatible.add(unitKey);
            }
        }
        // Asegurarse que la unidad de compra esté, por si acaso
        compatible.add(purchasedUnitValue);
        return Array.from(compatible);
    };
    
    const toggleWarning = (warningElement, message = "", isError = true) => {
      if (!warningElement) return;
      warningElement.textContent = message;
      warningElement.classList.toggle("hidden", !message);
      warningElement.style.color = isError ? 'var(--error-color)' : 'var(--warning-color)'; // Opcional: diferente color para advertencias vs errores
    };

    const convertToStandardBase = (quantity, unit) => {
        const unitInfo = baseConversionFactorsMuebles[unit];
        if (!unitInfo) return { quantity, unit, originalUnit: unit, factor: 1 };
        if (unitInfo.baseUnit === unit) {
             return { quantity: quantity * unitInfo.factor, unit: unitInfo.baseUnit, originalUnit: unit, factor: unitInfo.factor };
        }
        if (["g", "m", "ml", "m2"].includes(unitInfo.baseUnit)) {
             return { quantity: quantity * unitInfo.factor, unit: unitInfo.baseUnit, originalUnit: unit, factor: unitInfo.factor };
        }
        return { quantity, unit, originalUnit: unit, factor: 1 }; // Caso por defecto, trata la unidad como su propia base si no hay conversión directa
    };

    const updateCompatibleUsedUnits = (purchasedUnitSelectEl, usedUnitSelectEl, defaultUsedUnit = null) => {
        if (!purchasedUnitSelectEl || !usedUnitSelectEl) return;
        const purchasedUnitValue = purchasedUnitSelectEl.value;
        const compatibleUnits = getCompatibleUnitsForSelect(purchasedUnitValue);
        const currentUsedUnitInSelect = usedUnitSelectEl.value;

        let selectedValue = null;
        if (compatibleUnits.includes(currentUsedUnitInSelect)) {
            selectedValue = currentUsedUnitInSelect;
        } else if (defaultUsedUnit && compatibleUnits.includes(defaultUsedUnit)) {
            selectedValue = defaultUsedUnit;
        } else if (compatibleUnits.length > 0) {
            selectedValue = compatibleUnits[0]; // Por defecto la primera compatible
        }

        usedUnitSelectEl.innerHTML = ""; // Limpiar opciones
        const originalSelectOptions = Array.from(purchasedUnitSelectEl.options).reduce((acc, opt) => {
            acc[opt.value] = opt.textContent;
            return acc;
        }, {});

        compatibleUnits.forEach(unitKey => {
            const option = document.createElement("option");
            option.value = unitKey;
            option.textContent = originalSelectOptions[unitKey] || unitKey; // Usar texto amigable si está disponible
            usedUnitSelectEl.appendChild(option);
        });

        if (selectedValue) {
            usedUnitSelectEl.value = selectedValue;
        } else if (usedUnitSelectEl.options.length > 0) {
            usedUnitSelectEl.value = usedUnitSelectEl.options[0].value;
        }
    };

    const calculateItemCost = (totalQty, totalUnit, price, usedQty, usedUnit) => {
        if (!areUnitsCompatibleMuebles(totalUnit, usedUnit)) {
             console.error(`Intento de cálculo con unidades incompatibles: ${totalUnit} y ${usedUnit}`);
             return 0;
        }
        if (totalQty <= 0 || price <= 0 || usedQty < 0) {
            return 0;
        }

        const baseTotal = convertToStandardBase(totalQty, totalUnit);
        const baseUsed = convertToStandardBase(usedQty, usedUnit);

        // Solo calcular si las unidades base son iguales después de la conversión a estándar, o si hay una conversión directa conocida.
        // Esta lógica es crucial y puede necesitar ajustes finos según cómo se definan las unidades "discretas" y sus factores.
        if (baseTotal.unit !== baseUsed.unit) {
             // Excepción: si compramos una "placa" (que es 1 unidad discreta) y queremos usar una porción en "m2".
             // Necesitaríamos el área total de la placa para hacer la proporción.
             // Esta función simple no maneja esos casos complejos. Deberían ser 0 o NaN.
             // Para la guía interactiva, es mejor que el usuario ya sepa el costo de la porción si las unidades no son directamente proporcionales.
            console.warn(`Las unidades base ${baseTotal.unit} y ${baseUsed.unit} no son directamente comparables aquí para el cálculo simple de costo.`);
            return 0; // O un valor que indique error
        }

        if (baseTotal.quantity === 0) return 0; // Evitar división por cero

        const costPerBase = price / baseTotal.quantity;
        const finalCost = costPerBase * baseUsed.quantity;

        return isNaN(finalCost) ? 0 : finalCost;
    };

    // --- Selectores del DOM (Guía Interactiva de Muebles) ---
    const steps = document.querySelectorAll('.step');
    const nextButtons = document.querySelectorAll('.next-step-btn');
    const prevButtons = document.querySelectorAll('.prev-step-btn');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressSteps = document.querySelectorAll('.progress-step');
    const calculateFinalBtn = document.getElementById('calculate-final-guide-btn');
    const generatePdfBtn = document.getElementById('generate-pdf-btn');
    const finalResultsDiv = document.getElementById('guide-final-results');
    const pdfLoader = document.getElementById('pdf-loader');
    const pdfError = document.getElementById('error-pdf');
    const postPdfModal = document.getElementById('post-pdf-modal');
    const modalCloseButtons = postPdfModal?.querySelectorAll('[data-close-modal]');

    // Inputs y Elementos de Datos por Paso
    // Paso 1
    const muebleNameInput = document.getElementById('guide-mueble-name');
    // Paso 2
    const matNameInput = document.getElementById('guide-mat-name');
    const matPriceInput = document.getElementById('guide-mat-price');
    const matTotalQtyInput = document.getElementById('guide-mat-total-qty');
    const matTotalUnitSelect = document.getElementById('guide-mat-total-unit');
    const matUsedQtyInput = document.getElementById('guide-mat-used-qty');
    const matUsedUnitSelect = document.getElementById('guide-mat-used-unit');
    const matUnitWarning = document.getElementById('guide-mat-unit-warning');
    const addMaterialBtn = document.getElementById('add-material-guide-btn');
    const materialsListUl = document.getElementById('guide-materials-list');
    const materialsTotalSpan = document.getElementById('guide-materials-total');
    const emptyMaterialsListMsg = materialsListUl?.querySelector('.list-empty');
    // Paso 3
    const finishesCostInput = document.getElementById('guide-finishes-cost');
    const consumablesCostInput = document.getElementById('guide-consumables-cost');
    const packagingCostInput = document.getElementById('guide-packaging-cost');
    // Paso 4
    const timeInput = document.getElementById('guide-time');
    const hourlyRateInput = document.getElementById('guide-hourly-rate');
    const laborCostDisplay = document.getElementById('guide-labor-cost-display');
    // Paso 5
    const fixedCostInput = document.getElementById('guide-fixed-cost');
    // Paso 6
    const profitInput = document.getElementById('guide-profit');
    const unitsInput = document.getElementById('guide-units'); // Cantidad de muebles idénticos
    // Resultados Finales (Spans)
    const resMuebleName = document.getElementById('res-mueble-name');
    const resMaterialOtros = document.getElementById('res-material-otros'); // Materiales + Acabados + Consumibles + Embalaje
    const resLabor = document.getElementById('res-labor');
    const resFixed = document.getElementById('res-fixed');
    const resTotalCost = document.getElementById('res-total-cost');
    const resProfitPerc = document.getElementById('res-profit-perc');
    const resProfit = document.getElementById('res-profit');
    const resUnitsInfo1 = document.getElementById('res-units-info1'); // Para "por X mueble(s)"
    const resFinalPrice = document.getElementById('res-final-price');
    const resUnitPriceRow = document.getElementById('res-unit-price-row');
    const resUnitPrice = document.getElementById('res-unit-price');

    // --- Estado de la Guía ---
    let currentStep = 1;
    const totalSteps = steps.length;
    let muebleData = {
        name: '',
        materials: [], // Array de objetos {name, totalQty, totalUnit, price, usedQty, usedUnit, cost, id}
        finishesCost: 0,
        consumablesCost: 0,
        packagingCost: 0,
        time: 0, // en minutos
        hourlyRate: 0,
        laborCost: 0,
        fixedCost: 0, // Porción asignada a este mueble
        profitPercentage: 50, // Default para muebles
        units: 1, // Cantidad de muebles idénticos
        totalMaterialCost: 0, // Solo materiales directos del paso 2
        totalOtrosCostosDirectos: 0, // Acabados + Consumibles + Embalaje (Paso 3)
        totalCost: 0, // Costo total de fabricación
        profitAmount: 0,
        finalPrice: 0, // Precio total para todas las unidades
        unitPrice: 0 // Precio por cada mueble si son varios
    };

    // --- Funciones de Validación y UI Específicas de la Guía ---
    const showError = (fieldIdOrElement, message) => {
        const errorDiv = typeof fieldIdOrElement === 'string' ? document.getElementById(`error-${fieldIdOrElement}`) : fieldIdOrElement.closest('.form-group')?.querySelector('.error-message');
        const inputElement = typeof fieldIdOrElement === 'string' ? document.getElementById(`guide-${fieldIdOrElement}`) || document.getElementById(fieldIdOrElement) : fieldIdOrElement;

        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        }
        if (inputElement && inputElement.tagName !== 'DIV') { // No aplicar 'invalid' a divs de error
            inputElement.classList.add('invalid');
        }
    };

    const clearError = (fieldIdOrElement) => {
        const errorDiv = typeof fieldIdOrElement === 'string' ? document.getElementById(`error-${fieldIdOrElement}`) : fieldIdOrElement.closest('.form-group')?.querySelector('.error-message');
        const inputElement = typeof fieldIdOrElement === 'string' ? document.getElementById(`guide-${fieldIdOrElement}`) || document.getElementById(fieldIdOrElement) : fieldIdOrElement;

        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
         if (inputElement && inputElement.tagName !== 'DIV') {
            inputElement.classList.remove('invalid');
        }
    };

    const clearStepErrors = (stepElement) => {
        stepElement?.querySelectorAll('.error-message').forEach(el => el.classList.add('hidden'));
        stepElement?.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
        stepElement?.querySelectorAll('.unit-warning').forEach(el => el.classList.add('hidden'));
    };

    const validateStep = (stepNumber) => {
        let isValid = true;
        const currentStepElement = document.getElementById(`step-${stepNumber}`);
        if (!currentStepElement) return true;

        clearStepErrors(currentStepElement);

        switch (stepNumber) {
            case 1: // Nombre del Mueble
                if (!muebleNameInput?.value.trim()) {
                    showError(muebleNameInput, 'Por favor, dale un nombre a tu mueble o proyecto.');
                    isValid = false;
                }
                break;
            case 2: // Materiales
                if (muebleData.materials.length === 0) {
                    showError('materials-list', '¡No te olvides de agregar los materiales que usaste!'); // usa el ID del div de error
                    isValid = false;
                } else { clearError('materials-list'); }
                break;
            case 3: // Otros Costos Directos
                if (isNaN(parseFloatInput(finishesCostInput?.value))) { showError(finishesCostInput, 'Ingresá un número válido o 0.'); isValid = false; }
                if (isNaN(parseFloatInput(consumablesCostInput?.value))) { showError(consumablesCostInput, 'Ingresá un número válido o 0.'); isValid = false; }
                if (isNaN(parseFloatInput(packagingCostInput?.value))) { showError(packagingCostInput, 'Ingresá un número válido o 0.'); isValid = false; }
                break;
            case 4: // Tiempo y Mano de Obra
                if (parseIntInput(timeInput?.value, 0) <= 0 && hourlyRateInput?.value > 0) { showError(timeInput, 'Si ponés valor/hora, el tiempo debe ser mayor a 0.'); isValid = false; }
                else if (parseIntInput(timeInput?.value, 0) < 0) { showError(timeInput, 'El tiempo no puede ser negativo.'); isValid = false;}
                if (parseFloatInput(hourlyRateInput?.value) < 0) { showError(hourlyRateInput, 'El valor por hora no puede ser negativo.'); isValid = false; }
                break;
            case 5: // Gastos Fijos
                if (isNaN(parseFloatInput(fixedCostInput?.value))) { showError(fixedCostInput, 'Ingresá un número válido o 0.'); isValid = false; }
                break;
            case 6: // Precio Final (validar ANTES de calcular)
                if (parseFloatInput(profitInput?.value) < 0) { showError(profitInput, 'La ganancia no puede ser negativa.'); isValid = false; }
                if (parseIntInput(unitsInput?.value, 1) < 1) { showError(unitsInput, 'La cantidad de muebles debe ser al menos 1.'); isValid = false; }
                break;
        }
        return isValid;
    };

    // --- Funciones de Navegación y Estado ---
    const updateProgress = () => {
        const progressPercentage = totalSteps > 1 ? (((currentStep - 1) / (totalSteps -1 )) * 100) : 0;
        if (progressBarFill) progressBarFill.style.width = `${progressPercentage}%`;

        progressSteps?.forEach((stepIndicator) => {
            const stepNum = parseInt(stepIndicator.dataset.step);
            stepIndicator.classList.remove('active', 'completed');
            if (stepNum === currentStep) {
                stepIndicator.classList.add('active');
            } else if (stepNum < currentStep) {
                stepIndicator.classList.add('completed');
            }
        });
    };

    const showStep = (stepNumber) => {
        steps?.forEach(step => step.classList.remove('active'));
        const nextStepElement = document.getElementById(`step-${stepNumber}`);
        if (nextStepElement) {
            nextStepElement.classList.add('active');
            clearStepErrors(nextStepElement);
            // Scroll to the top of the step content, especially useful on mobile
            if (window.innerWidth < 768) {
                nextStepElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            console.error(`Elemento del paso ${stepNumber} no encontrado.`);
        }
        updateProgress();
    };

    const saveCurrentStepData = () => {
        try {
            switch(currentStep) {
                case 1: muebleData.name = muebleNameInput?.value.trim() || 'Mueble sin nombre'; break;
                case 2: /* Materiales se guardan al agregar/eliminar */ break;
                case 3:
                    muebleData.finishesCost = parseFloatInput(finishesCostInput?.value);
                    muebleData.consumablesCost = parseFloatInput(consumablesCostInput?.value);
                    muebleData.packagingCost = parseFloatInput(packagingCostInput?.value);
                    break;
                case 4:
                    muebleData.time = parseIntInput(timeInput?.value, 0);
                    muebleData.hourlyRate = parseFloatInput(hourlyRateInput?.value);
                    muebleData.laborCost = (muebleData.time / 60) * muebleData.hourlyRate;
                    calculateAndUpdateLaborCostDisplay(); // Actualizar display intermedio
                    break;
                case 5: muebleData.fixedCost = parseFloatInput(fixedCostInput?.value); break;
                case 6: // Se guardan antes de calcular en calculateFinalResults()
                    muebleData.profitPercentage = parseFloatInput(profitInput?.value);
                    muebleData.units = parseIntInput(unitsInput?.value, 1);
                    break;
            }
        } catch (error) {
            console.error("Error guardando datos del paso:", currentStep, error);
        }
    };

    const goToNextStep = () => {
        if (validateStep(currentStep)) {
            saveCurrentStepData();
            if (currentStep < totalSteps) {
                currentStep++;
                showStep(currentStep);
            }
        }
    };

    const goToPrevStep = () => {
        // No es necesario guardar datos al retroceder, ya que se validan al avanzar.
        if (currentStep > 1) {
            currentStep--;
            showStep(currentStep);
        }
    };

    // --- Lógica Específica de Pasos ---

    // == PASO 2: Materiales ==
    const renderMaterialsList = () => {
        if (!materialsListUl) return;
        materialsListUl.querySelectorAll('li:not(.list-header):not(.list-empty)').forEach(li => li.remove());

        if (muebleData.materials.length === 0) {
            emptyMaterialsListMsg?.classList.remove('hidden');
        } else {
            emptyMaterialsListMsg?.classList.add('hidden');
            muebleData.materials.forEach(mat => {
                const li = document.createElement('li');
                li.dataset.id = mat.id;
                // Obtener el texto de la unidad seleccionada para mostrarlo
                const totalUnitText = matTotalUnitSelect.querySelector(`option[value="${mat.totalUnit}"]`)?.textContent || mat.totalUnit;
                const usedUnitText = matUsedUnitSelect.querySelector(`option[value="${mat.usedUnit}"]`)?.textContent || mat.usedUnit;

                li.innerHTML = `
                    <span>${mat.name} (${mat.usedQty} ${usedUnitText})</span>
                    <span>${formatCurrency(mat.cost)}</span>
                    <span><button class="btn-delete-ing" title="Eliminar ${mat.name}">X</button></span>
                `;
                // Insertar antes del mensaje de lista vacía (si existe y está visible) o al final.
                if(emptyMaterialsListMsg && !emptyMaterialsListMsg.classList.contains('hidden')) {
                    materialsListUl.insertBefore(li, emptyMaterialsListMsg);
                } else if (emptyMaterialsListMsg) {
                     materialsListUl.insertBefore(li, emptyMaterialsListMsg); // Siempre antes si existe
                }
                 else {
                    materialsListUl.appendChild(li);
                }
                li.querySelector('.btn-delete-ing')?.addEventListener('click', handleDeleteMaterial);
            });
        }
        updateTotalMaterialCost();
    };

    const updateTotalMaterialCost = () => {
        muebleData.totalMaterialCost = muebleData.materials.reduce((sum, mat) => sum + (mat.cost || 0), 0);
        if (materialsTotalSpan) {
            materialsTotalSpan.textContent = formatCurrency(muebleData.totalMaterialCost);
        }
    };

    const handleDeleteMaterial = (event) => {
        const button = event.target;
        const li = button.closest('li');
        if (!li || !li.dataset.id) return;
        const idToDelete = parseInt(li.dataset.id);
        muebleData.materials = muebleData.materials.filter(mat => mat.id !== idToDelete);
        renderMaterialsList();
        validateStep(2); // Revalidar por si queda vacío (mostrará el error si es el caso)
    };

    const addMaterialHandler = () => {
        clearError(matNameInput); clearError(matPriceInput);
        clearError(matTotalQtyInput); clearError(matUsedQtyInput);
        clearError('add-material'); // Error general del formulario de material
        toggleWarning(matUnitWarning); // Limpiar advertencia de unidades

        const name = matNameInput?.value.trim();
        const price = parseFloatInput(matPriceInput?.value);
        const totalQty = parseFloatInput(matTotalQtyInput?.value);
        const totalUnit = matTotalUnitSelect?.value;
        const usedQty = parseFloatInput(matUsedQtyInput?.value);
        const usedUnit = matUsedUnitSelect?.value;
        let materialValid = true;

        if (!name) { showError(matNameInput, 'Dale un nombre al material.'); materialValid = false; }
        if (price <= 0) { showError(matPriceInput, 'El precio debe ser mayor a 0.'); materialValid = false; }
        if (totalQty <= 0) { showError(matTotalQtyInput, 'La cantidad comprada debe ser mayor a 0.'); materialValid = false; }
        if (usedQty < 0) { showError(matUsedQtyInput, 'La cantidad usada no puede ser negativa (puede ser 0).'); materialValid = false; }

        if (!areUnitsCompatibleMuebles(totalUnit, usedUnit)) {
            toggleWarning(matUnitWarning, `Las unidades '${matTotalUnitSelect.options[matTotalUnitSelect.selectedIndex].text}' y '${matUsedUnitSelect.options[matUsedUnitSelect.selectedIndex].text}' no son compatibles para un cálculo directo.`);
            materialValid = false;
        }

        if (!materialValid) {
            showError('add-material', "Revisá los campos marcados en el formulario del material.");
            return;
        }

        const itemCost = calculateItemCost(totalQty, totalUnit, price, usedQty, usedUnit);
        if (isNaN(itemCost)) { // Debería ser manejado por calculateItemCost devolviendo 0
             showError('add-material', 'Error al calcular costo del material. Revisá valores y unidades.');
             return;
        }

        muebleData.materials.push({ name, totalQty, totalUnit, price, usedQty, usedUnit, cost: itemCost, id: Date.now() });
        renderMaterialsList();
        clearError('materials-list'); // Limpiar error de lista vacía si se agregó uno

        // Limpiar formulario
        if(matNameInput) matNameInput.value = '';
        if(matPriceInput) matPriceInput.value = '';
        if(matTotalQtyInput) matTotalQtyInput.value = '';
        if(matUsedQtyInput) matUsedQtyInput.value = '';
        // No resetear los selects de unidad, para facilitar ingresos múltiples
        matNameInput?.focus();
    };

    // == PASO 4: Mano de Obra ==
    const calculateAndUpdateLaborCostDisplay = () => {
        const timeMins = parseIntInput(timeInput?.value, 0);
        const rate = parseFloatInput(hourlyRateInput?.value);
        const cost = (rate >= 0 && timeMins >= 0) ? (timeMins / 60) * rate : 0;
        if (laborCostDisplay) {
            laborCostDisplay.textContent = formatCurrency(cost);
        }
        // El guardado en muebleData.laborCost se hace en saveCurrentStepData
    };

    // == PASO 6: Cálculo Final ==
    const calculateFinalResults = () => {
        saveCurrentStepData(); // Asegurar que los datos del paso 6 (profit, units) estén guardados

        if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4) || !validateStep(5) || !validateStep(6)) {
             finalResultsDiv?.classList.add('hidden');
             if(generatePdfBtn) generatePdfBtn.disabled = true;
             alert("¡Ojo! Parece que faltan datos o hay errores en algunos pasos anteriores. Revisalos y volvé a calcular.");
             return false; // Detener si algún paso previo o el actual no es válido
        }


        // Recalcular totales de costos (algunos ya están en muebleData por saveCurrentStepData)
        muebleData.totalMaterialCost = muebleData.materials.reduce((sum, mat) => sum + (mat.cost || 0), 0); // Actualizar por si acaso
        muebleData.totalOtrosCostosDirectos = muebleData.finishesCost + muebleData.consumablesCost + muebleData.packagingCost;
        muebleData.laborCost = (muebleData.time / 60) * muebleData.hourlyRate; // Recalcular por si acaso
        // fixedCost ya está en muebleData.fixedCost

        muebleData.totalCost = muebleData.totalMaterialCost + muebleData.totalOtrosCostosDirectos + muebleData.laborCost + muebleData.fixedCost;
        muebleData.profitAmount = muebleData.totalCost * (muebleData.profitPercentage / 100);
        muebleData.finalPrice = muebleData.totalCost + muebleData.profitAmount; // Este es el precio para la cantidad total de unidades
        muebleData.unitPrice = muebleData.units > 0 ? muebleData.finalPrice / muebleData.units : 0;

        // Mostrar resultados
        if(resMuebleName) resMuebleName.textContent = muebleData.name || 'Tu Mueble';
        if(resMaterialOtros) resMaterialOtros.textContent = formatCurrency(muebleData.totalMaterialCost + muebleData.totalOtrosCostosDirectos);
        if(resLabor) resLabor.textContent = formatCurrency(muebleData.laborCost);
        if(resFixed) resFixed.textContent = formatCurrency(muebleData.fixedCost);
        if(resTotalCost) resTotalCost.textContent = formatCurrency(muebleData.totalCost);
        if(resProfitPerc) resProfitPerc.textContent = muebleData.profitPercentage;
        if(resProfit) resProfit.textContent = formatCurrency(muebleData.profitAmount);

        if(resUnitsInfo1) resUnitsInfo1.textContent = muebleData.units;
        if(resFinalPrice) resFinalPrice.textContent = formatCurrency(muebleData.finalPrice);

        if (muebleData.units > 1) {
            if(resUnitPrice) resUnitPrice.textContent = formatCurrency(muebleData.unitPrice);
            if(resUnitPriceRow) resUnitPriceRow.classList.remove('hidden');
             if(resFinalPrice && resUnitsInfo1) resFinalPrice.closest('p').querySelector('strong').previousSibling.textContent = `PRECIO DE VENTA SUGERIDO (por ${muebleData.units} muebles): `;
        } else {
            if(resUnitPriceRow) resUnitPriceRow.classList.add('hidden');
            if(resFinalPrice && resUnitsInfo1) resFinalPrice.closest('p').querySelector('strong').previousSibling.textContent = `PRECIO DE VENTA SUGERIDO (por 1 mueble): `;
        }

        finalResultsDiv?.classList.remove('hidden');
        if (generatePdfBtn) {
            generatePdfBtn.disabled = !jsPDF_is_loaded; // Habilitar solo si jsPDF está ok
             if (!jsPDF_is_loaded) {
                 showError('pdf', 'La librería PDF no está cargada. No se puede generar.');
             } else { clearError('pdf'); }
        }
        return true;
    };

    // == GENERACIÓN DE PDF (Adaptado para Muebles) ==
    const generateMueblePDF = () => {
        if (!jsPDF_is_loaded || !jsPDF_AutoTable_is_loaded) {
            showError('pdf', 'Error: La librería PDF o su plugin de tablas no están cargados.');
            return;
        }
        if (!finalResultsDiv || finalResultsDiv.classList.contains('hidden')) {
            showError('pdf', 'Primero calculá los resultados finales para poder generar el PDF.');
            return;
        }

        pdfLoader?.classList.remove('hidden');
        if(generatePdfBtn) generatePdfBtn.disabled = true;
        clearError('pdf');

        setTimeout(() => {
            try {
                const { jsPDF } = window.jspdf; // Asegurar que se toma del global
                const doc = new jsPDF();
                const pageHeight = doc.internal.pageSize.height;
                const pageWidth = doc.internal.pageSize.width;
                const margin = 15;
                let currentY = margin;
                const lineHeight = 7; // Espacio entre líneas de texto simple

                // --- Título ---
                doc.setFontSize(18); doc.setFont(undefined, 'bold');
                doc.text('Resumen de Costos de Fabricación', pageWidth / 2, currentY, { align: 'center' });
                currentY += lineHeight * 2;

                // --- Nombre del Mueble ---
                doc.setFontSize(14); doc.setFont(undefined, 'normal');
                doc.text(`Mueble/Proyecto: ${muebleData.name || 'Sin Nombre'}`, margin, currentY);
                currentY += lineHeight * 2;

                // --- Tabla de Materiales ---
                doc.setFontSize(12); doc.setFont(undefined, 'bold');
                doc.text('Materiales Directos Usados:', margin, currentY);
                currentY += lineHeight;

                const headMaterials = [['Material', 'Cant. Compra', 'Precio Compra', 'Cant. Usada', 'Costo para Mueble']];
                const bodyMaterials = muebleData.materials.map(mat => [
                    mat.name,
                    `${mat.totalQty} ${matTotalUnitSelect.querySelector(`option[value="${mat.totalUnit}"]`)?.textContent || mat.totalUnit}`,
                    formatCurrency(mat.price),
                    `${mat.usedQty} ${matUsedUnitSelect.querySelector(`option[value="${mat.usedUnit}"]`)?.textContent || mat.usedUnit}`,
                    formatCurrency(mat.cost)
                ]);
                doc.autoTable({
                    head: headMaterials, body: bodyMaterials, startY: currentY,
                    margin: { left: margin, right: margin }, theme: 'grid',
                    headStyles: { fillColor: [147, 51, 234] }, // --purple-600
                    styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
                    columnStyles: {
                        0: { cellWidth: 'auto' }, // Nombre material
                        1: { cellWidth: 40 },     // Compra Cant
                        2: { cellWidth: 35, halign: 'right' }, // Compra Precio
                        3: { cellWidth: 35 },     // Usado Cant
                        4: { cellWidth: 35, halign: 'right' }  // Costo
                    },
                    didDrawPage: (data) => addPdfFooter(doc, data.pageNumber, doc.internal.getNumberOfPages())
                });
                currentY = doc.autoTable.previous.finalY + lineHeight;

                // --- Otros Costos Directos ---
                currentY = checkNewPage(doc, currentY, pageHeight, margin, lineHeight * 4);
                doc.setFontSize(12); doc.setFont(undefined, 'bold');
                doc.text('Otros Costos Directos:', margin, currentY);
                currentY += lineHeight;
                doc.setFontSize(10); doc.setFont(undefined, 'normal');
                currentY = drawKeyValueLine(doc, 'Costo Acabados (pintura, barniz, etc.):', formatCurrency(muebleData.finishesCost), margin, currentY, pageWidth, lineHeight);
                currentY = drawKeyValueLine(doc, 'Costo Consumibles (lijas, mechas, etc.):', formatCurrency(muebleData.consumablesCost), margin, currentY, pageWidth, lineHeight);
                currentY = drawKeyValueLine(doc, 'Costo Embalaje (si aplica):', formatCurrency(muebleData.packagingCost), margin, currentY, pageWidth, lineHeight);
                currentY += lineHeight * 0.5; // Un pequeño espacio extra

                // --- Desglose de Costos Totales y Precio ---
                currentY = checkNewPage(doc, currentY, pageHeight, margin, lineHeight * 10); // Espacio para el resto
                doc.setFontSize(12); doc.setFont(undefined, 'bold');
                doc.text('Resumen de Costos y Precio Sugerido:', margin, currentY);
                currentY += lineHeight;
                doc.setFontSize(10); doc.setFont(undefined, 'normal');

                currentY = drawKeyValueLine(doc, 'Total Materiales + Otros Directos:', formatCurrency(muebleData.totalMaterialCost + muebleData.totalOtrosCostosDirectos), margin, currentY, pageWidth, lineHeight);
                currentY = drawKeyValueLine(doc, 'Total Mano de Obra (Tu Tiempo):', formatCurrency(muebleData.laborCost), margin, currentY, pageWidth, lineHeight);
                currentY = drawKeyValueLine(doc, 'Total Gastos Fijos del Taller (asignado):', formatCurrency(muebleData.fixedCost), margin, currentY, pageWidth, lineHeight);
                doc.setLineWidth(0.5); doc.line(margin, currentY, pageWidth - margin, currentY); // Línea separadora
                currentY += lineHeight;
                doc.setFont(undefined, 'bold');
                currentY = drawKeyValueLine(doc, 'COSTO TOTAL DE FABRICACIÓN:', formatCurrency(muebleData.totalCost), margin, currentY, pageWidth, lineHeight, [219, 39, 119]); // Rosa oscuro para costo
                doc.setFont(undefined, 'normal');
                doc.setLineWidth(0.2); doc.line(margin, currentY, pageWidth - margin, currentY);
                currentY += lineHeight;

                currentY = drawKeyValueLine(doc, `Tu Ganancia Estimada (${muebleData.profitPercentage}%):`, formatCurrency(muebleData.profitAmount), margin, currentY, pageWidth, lineHeight);
                doc.setFont(undefined, 'bold');
                currentY = drawKeyValueLine(doc, `PRECIO VENTA SUGERIDO (x${muebleData.units} unid.):`, formatCurrency(muebleData.finalPrice), margin, currentY, pageWidth, lineHeight, [22, 163, 74]); // Verde para precio
                if (muebleData.units > 1) {
                    currentY = drawKeyValueLine(doc, 'Precio Sugerido por Unidad:', formatCurrency(muebleData.unitPrice), margin, currentY, pageWidth, lineHeight, [22, 100, 50]);
                }
                doc.setFont(undefined, 'normal');
                currentY += lineHeight;

                // Disclaimer
                currentY = checkNewPage(doc, currentY, pageHeight, margin, lineHeight * 3);
                doc.setFontSize(8); doc.setTextColor(100);
                doc.text("Recordá: Este es un precio sugerido. Analizá tu mercado, la calidad de tus materiales, tu diseño y el valor que aportás.", margin, currentY, { maxWidth: pageWidth - margin * 2 });

                addPdfFooter(doc, doc.internal.getPageInfo(doc.internal.getCurrentPageInfo().pageNumber).pageNumber, doc.internal.getNumberOfPages()); // Pie de página en la última
                doc.save(`Costos_${(muebleData.name || 'Mueble').replace(/[^a-z0-9]/gi, '_')}.pdf`);

                // Mostrar modal de agradecimiento/siguientes pasos
                if (postPdfModal) {
                    try { postPdfModal.showModal(); } catch (e) { console.error("Error al mostrar modal:", e); }
                }

            } catch (error) {
                console.error("Error al generar el PDF del mueble:", error);
                showError('pdf', 'Ups! Hubo un problema al intentar generar el PDF.');
            } finally {
                pdfLoader?.classList.add('hidden');
                if(generatePdfBtn) generatePdfBtn.disabled = false;
            }
        }, 100); // Pequeño delay para que se muestre el loader
    };

    const checkNewPage = (doc, currentY, pageHeight, margin, spaceNeeded) => {
        if (currentY + spaceNeeded > pageHeight - margin - 15) { // 15 para el footer
            addPdfFooter(doc, doc.internal.getPageInfo(doc.internal.getCurrentPageInfo().pageNumber).pageNumber, doc.internal.getNumberOfPages());
            doc.addPage();
            return margin; // Reset Y to top margin
        }
        return currentY;
    };

    const drawKeyValueLine = (doc, key, value, x, y, pageWidth, lineHeight, color = [0,0,0]) => {
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(key, x, y);
        doc.text(value, pageWidth - x, y, { align: 'right' });
        doc.setTextColor(0,0,0); // Reset color
        return y + lineHeight;
    };

    const addPdfFooter = (doc, pageNum, totalPages) => {
         const pageHeight = doc.internal.pageSize.height;
         const pageWidth = doc.internal.pageSize.width;
         const margin = 15;
         const footerY = pageHeight - margin + 7; // Un poco más abajo

         doc.setFontSize(8);
         doc.setTextColor(150, 150, 150); // Gris
         const siteName = "Tu Taller Eficiente"; // Reemplazar con el nombre real del sitio
         doc.text(`PDF generado desde ${siteName} (${window.location.hostname})`, margin, footerY);
         doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
         doc.setTextColor(0,0,0); // Reset color
    };


    // --- Event Listeners ---
    nextButtons?.forEach(button => button.addEventListener('click', goToNextStep));
    prevButtons?.forEach(button => button.addEventListener('click', goToPrevStep));
    addMaterialBtn?.addEventListener('click', addMaterialHandler);

    matTotalUnitSelect?.addEventListener('change', () => {
        updateCompatibleUsedUnits(matTotalUnitSelect, matUsedUnitSelect);
        toggleWarning(matUnitWarning); // Limpiar advertencia al cambiar
    });
    matUsedUnitSelect?.addEventListener('change', () => { // Validar al cambiar unidad usada
         if (!areUnitsCompatibleMuebles(matTotalUnitSelect.value, matUsedUnitSelect.value)) {
             toggleWarning(matUnitWarning, `Unidades '${matTotalUnitSelect.options[matTotalUnitSelect.selectedIndex].text}' y '${matUsedUnitSelect.options[matUsedUnitSelect.selectedIndex].text}' no son compatibles.`);
         } else { toggleWarning(matUnitWarning); }
    });

    timeInput?.addEventListener('input', calculateAndUpdateLaborCostDisplay);
    hourlyRateInput?.addEventListener('input', calculateAndUpdateLaborCostDisplay);

    calculateFinalBtn?.addEventListener('click', calculateFinalResults);
    generatePdfBtn?.addEventListener('click', generateMueblePDF);

    // Limpiar errores al escribir en los inputs principales de cada paso
    const inputsToClearErrorOnInput = [
        muebleNameInput, matNameInput, matPriceInput, matTotalQtyInput, matUsedQtyInput,
        finishesCostInput, consumablesCostInput, packagingCostInput,
        timeInput, hourlyRateInput, fixedCostInput, profitInput, unitsInput
    ];
    inputsToClearErrorOnInput.forEach(inputEl => {
        inputEl?.addEventListener('input', () => clearError(inputEl));
    });
    
    // Cerrar modal
    modalCloseButtons?.forEach(button => {
        button.addEventListener('click', () => {
            postPdfModal?.close();
        });
    });
    postPdfModal?.addEventListener('click', function(event) { // Cerrar al hacer clic fuera
      if (event.target === postPdfModal) {
        postPdfModal.close();
      }
    });


    // --- Inicialización de la Guía ---
    if (steps.length > 0) {
        showStep(currentStep); // Mostrar el primer paso
        // Inicializar unidades para el formulario de materiales
        if (matTotalUnitSelect && matUsedUnitSelect) {
            // Llenar el select de unidad de compra con las opciones del HTML
            // (esto asume que matTotalUnitSelect ya tiene las options)
            updateCompatibleUsedUnits(matTotalUnitSelect, matUsedUnitSelect, 'unid'); // Default a 'unid' o la primera compatible
        }
        renderMaterialsList(); // Mostrar lista vacía (o con items si se implementa persistencia)
        calculateAndUpdateLaborCostDisplay(); // Calcular costo laboral inicial (será 0 si los inputs están vacíos)
    } else {
        console.warn("No se encontraron elementos de pasos (.step) en la página de la guía.");
    }

}); // Fin DOMContentLoaded
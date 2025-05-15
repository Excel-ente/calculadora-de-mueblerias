/**
 * Script principal para la Calculadora de Costos de Muebles - Tu Taller Eficiente.
 * Maneja el cálculo rápido de materiales/cortes, la calculadora de gastos fijos del taller,
 * y la interactividad del ejemplo práctico de cálculo de un mueble.
 * v2.0 - Corregido populate de #usedUnit y cálculo/actualización de Gastos Fijos.
 */

document.addEventListener("DOMContentLoaded", () => {
    /**
     * Establece el año actual en el footer.
     */
    const setCurrentYear = () => {
        const yearElement = document.getElementById("current-year");
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
        // También para el footer de la guía si existe
        const yearElementGuide = document.getElementById("current-year-footer");
        if (yearElementGuide) {
             yearElementGuide.textContent = new Date().getFullYear();
        }
    };

    // --- Constantes y Configuraciones Globales para MUEBLES ---
    const baseConversionFactorsMuebles = {
      // Peso
      kg:    { group: "weight", baseUnit: "g",    factor: 1000 },
      g:     { group: "weight", baseUnit: "g",    factor: 1 },
      // Longitud
      m:     { group: "length", baseUnit: "m",    factor: 1 },
      cm:    { group: "length", baseUnit: "m",    factor: 0.01 },
      mm:    { group: "length", baseUnit: "m",    factor: 0.001 },
      varilla: {group: "length_discrete", baseUnit: "varilla", factor: 1}, // Si se compra por varilla
      // Superficie
      m2:    { group: "area",   baseUnit: "m2",   factor: 1 },
      placa: { group: "area_discrete", baseUnit: "placa", factor: 1}, // Si se compra por placa
      // Volumen
      lt:    { group: "volume", baseUnit: "ml",   factor: 1000 },
      ml:    { group: "volume", baseUnit: "ml",   factor: 1 },
      // Unidades y Conjuntos
      unid:  { group: "discrete", baseUnit: "unid", factor: 1 },
      par:   { group: "discrete", baseUnit: "unid", factor: 2 },
      set:   { group: "discrete", baseUnit: "unid", factor: 1 },
      rollo: { group: "length_discrete", baseUnit: "rollo", factor: 1}
    };

    const getUnitGroupMuebles = (unit) => {
        return baseConversionFactorsMuebles[unit]?.group || null;
    };

    // --- Funciones Utilitarias ---

    const formatCurrency = (amount) => {
        if (isNaN(amount) || amount === null || amount === undefined) return "$0.00";
        // Asegurarse que no sea negativo accidentalmente por errores de cálculo pequeños
        const nonNegativeAmount = Math.max(0, amount);
        return nonNegativeAmount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const parseFloatInput = (value, allowNegative = false) => {
        if (value === null || value === undefined || String(value).trim() === "") return 0;
        const parsed = parseFloat(String(value).replace(',', '.'));
        if (isNaN(parsed)) return 0;
        return allowNegative ? parsed : Math.max(0, parsed); // Asegura >= 0 si allowNegative es false
    };

    const parseIntInput = (value, min = 1) => {
        if (value === null || value === undefined || String(value).trim() === "") return min;
        const parsed = parseInt(String(value).replace(',', '.').trim(), 10);
        const minimum = min === 0 ? 0 : (isNaN(min) ? 1 : min);
        if (isNaN(parsed) || parsed < minimum) {
            return minimum;
        }
        return parsed;
    };

    // Verifica si las unidades pertenecen al mismo grupo conceptual (peso, longitud, etc.)
    const areUnitsCompatibleMuebles = (unit1, unit2) => {
        if (!unit1 || !unit2) return false;
        const group1 = getUnitGroupMuebles(unit1);
        const group2 = getUnitGroupMuebles(unit2);

        // Caso especial: si compro por 'placa' o 'varilla' o 'rollo', puedo querer usar 'unid' (ej. 1 placa -> 0.5 unid)
        if ((group1 === "area_discrete" || group1 === "length_discrete") && group2 === "discrete") return true;
        if ((group2 === "area_discrete" || group2 === "length_discrete") && group1 === "discrete") return true;
        // Caso especial: si compro por 'par' o 'set', puedo querer usar 'unid' (ej. 1 par -> 1 unid)
        if (group1 === "discrete" && baseConversionFactorsMuebles[unit1]?.factor > 1 && unit2 === 'unid') return true;

        // Caso general: deben pertenecer al mismo grupo estándar
        return group1 === group2 && group1 !== null;
    };

    // Convierte una cantidad a la unidad base estándar (g, m, ml, m2) si es posible
    const convertToStandardBase = (quantity, unit) => {
        const unitInfo = baseConversionFactorsMuebles[unit];
        if (!unitInfo) return { quantity, unit: unit, originalUnit: unit, factor: 1 };

        if (["g", "m", "ml", "m2"].includes(unitInfo.baseUnit)) {
            return { quantity: quantity * unitInfo.factor, unit: unitInfo.baseUnit, originalUnit: unit, factor: unitInfo.factor };
        }
        // Para unidades discretas o que son su propia base (placa, varilla, unid, etc.)
        return { quantity: quantity * unitInfo.factor, unit: unitInfo.baseUnit, originalUnit: unit, factor: unitInfo.factor };
    };

    // Función para mostrar/ocultar advertencias
    const toggleWarning = (warningElement, message = "", isError = true) => {
        if (!warningElement) return;
        warningElement.textContent = message;
        warningElement.classList.toggle("hidden", !message);
        warningElement.style.color = isError ? 'var(--error-color)' : 'var(--warning-color)';
    };

    // --- Calculadora Rápida de Materiales/Cortes (Sección #calculator) ---
    const initIndividualMaterialCalculator = () => {
        // Inputs generales
        const nameInput = document.getElementById("name");
        const totalPriceInput = document.getElementById("totalPrice");
        const materialTypeSelect = document.getElementById("materialType");
        // Contenedores condicionales
        const placaInputsDiv = document.getElementById("placaInputs");
        const generalInputsDiv = document.getElementById("generalInputs");
        // Inputs Placa
        const purchasedPlacaWidthInput = document.getElementById("purchasedPlacaWidth");
        const purchasedPlacaHeightInput = document.getElementById("purchasedPlacaHeight");
        const purchasedPlacaUnitSelect = document.getElementById("purchasedPlacaUnit");
        const cutWidthInput = document.getElementById("cutWidth");
        const cutHeightInput = document.getElementById("cutHeight");
        const placaWarning = document.getElementById("unit-warning-placa");
        // Inputs General
        const purchasedQuantityInput = document.getElementById("purchasedQuantity");
        const purchasedUnitSelect = document.getElementById("purchasedUnit");
        const usedQuantityInput = document.getElementById("usedQuantity");
        const usedUnitSelect = document.getElementById("usedUnit");
        const generalWarning = document.getElementById("unit-warning-general");
        // Resultados
        const resultDiv = document.getElementById("result");
        const resultText = document.getElementById("result-text");
        const copyBtn = document.getElementById("copy-btn");
        const shareBtn = document.getElementById("share-btn");

        if (!nameInput || !materialTypeSelect) return; // Salir si la calculadora no existe

        // *** CORREGIDO: Función para poblar #usedUnit ***
        const updateUsedUnitOptions = () => {
            if (!purchasedUnitSelect || !usedUnitSelect) return;

            const currentUsedUnitValue = usedUnitSelect.value; // Guardar valor actual
            usedUnitSelect.innerHTML = ""; // Limpiar opciones actuales

            // Copiar todas las opciones de purchasedUnit a usedUnit
            Array.from(purchasedUnitSelect.options).forEach(option => {
                const newOption = document.createElement("option");
                newOption.value = option.value;
                newOption.textContent = option.textContent;
                usedUnitSelect.appendChild(newOption);
            });

            // Intentar reestablecer el valor previamente seleccionado
            if (Array.from(usedUnitSelect.options).some(opt => opt.value === currentUsedUnitValue)) {
                usedUnitSelect.value = currentUsedUnitValue;
            } else if (usedUnitSelect.options.length > 0) {
                // Si no se puede restablecer, seleccionar la primera opción
                usedUnitSelect.value = usedUnitSelect.options[0].value;
            }
        };

        const calculateIndividualCost = () => {
            toggleWarning(generalWarning); // Limpiar warnings previos
            toggleWarning(placaWarning);

            const name = nameInput.value.trim() || "Este material";
            const totalPrice = parseFloatInput(totalPriceInput.value);
            const materialType = materialTypeSelect.value;
            let finalCost = NaN; // Usar NaN para verificar si se calculó algo
            let calculationMessage = "";

            if (totalPrice <= 0) {
                resultDiv.classList.add("hidden");
                return;
            }

            if (materialType === "placa") {
                const purchasedPlacaWidth = parseFloatInput(purchasedPlacaWidthInput.value);
                const purchasedPlacaHeight = parseFloatInput(purchasedPlacaHeightInput.value);
                const purchasedPlacaUnit = purchasedPlacaUnitSelect.value;
                const cutWidth = parseFloatInput(cutWidthInput.value);
                const cutHeight = parseFloatInput(cutHeightInput.value);

                if (purchasedPlacaWidth <= 0 || purchasedPlacaHeight <= 0 || cutWidth <= 0 || cutHeight <= 0) {
                    resultDiv.classList.add("hidden");
                    return; // No calcular si faltan dimensiones
                }

                // Convertir dimensiones a una unidad base (mm parece bueno para placas)
                const convertToMM = (value, unit) => {
                    if (unit === "cm") return value * 10;
                    if (unit === "m") return value * 1000;
                    return value; // Asumir mm
                };

                const placaWidthMM = convertToMM(purchasedPlacaWidth, purchasedPlacaUnit);
                const placaHeightMM = convertToMM(purchasedPlacaHeight, purchasedPlacaUnit);
                const cutWidthMM = convertToMM(cutWidth, purchasedPlacaUnit);
                const cutHeightMM = convertToMM(cutHeight, purchasedPlacaUnit);

                const totalAreaPlaca = placaWidthMM * placaHeightMM;
                const areaCorte = cutWidthMM * cutHeightMM;

                if (totalAreaPlaca <= 0) {
                    toggleWarning(placaWarning, "El área de la placa comprada no puede ser cero.");
                    resultDiv.classList.add("hidden");
                    return;
                }
                if (areaCorte > totalAreaPlaca) {
                    toggleWarning(placaWarning, `El área del corte (${cutWidth}x${cutHeight}${purchasedPlacaUnit} = ${areaCorte/ (convertToMM(1, purchasedPlacaUnit)**2)} ${purchasedPlacaUnit}²) no puede ser mayor al área total de la placa (${purchasedPlacaWidth}x${purchasedPlacaHeight}${purchasedPlacaUnit} = ${totalAreaPlaca / (convertToMM(1, purchasedPlacaUnit)**2)} ${purchasedPlacaUnit}²).`);
                    resultDiv.classList.add("hidden");
                    return;
                }

                finalCost = (totalPrice / totalAreaPlaca) * areaCorte;
                calculationMessage = `El costo de un corte de ${cutWidth}x${cutHeight} ${purchasedPlacaUnit} de la placa "${name}" es ${formatCurrency(finalCost)}.`;

            } else { // Cálculo General
                const purchasedQuantity = parseFloatInput(purchasedQuantityInput.value, true); // Permitir > 0
                const purchasedUnitValue = purchasedUnitSelect.value;
                const usedQuantity = parseFloatInput(usedQuantityInput.value);
                const usedUnitValue = usedUnitSelect.value;

                 if (purchasedQuantity <= 0) {
                     toggleWarning(generalWarning, "La cantidad comprada debe ser mayor a 0.");
                     resultDiv.classList.add("hidden");
                     return;
                 }
                 // No ocultar si usedQuantity es 0, mostrar costo 0
                 // if (usedQuantity <= 0) {
                 //     resultDiv.classList.add("hidden");
                 //     return;
                 // }

                if (!areUnitsCompatibleMuebles(purchasedUnitValue, usedUnitValue)) {
                    toggleWarning(generalWarning, `Las unidades '${purchasedUnitSelect.options[purchasedUnitSelect.selectedIndex].text}' y '${usedUnitSelect.options[usedUnitSelect.selectedIndex].text}' no son directamente comparables para este cálculo.`);
                    resultDiv.classList.add("hidden");
                    return;
                }

                const purchasedStd = convertToStandardBase(purchasedQuantity, purchasedUnitValue);
                const usedStd = convertToStandardBase(usedQuantity, usedUnitValue);

                // Segunda validación: las unidades BASE deben ser iguales después de la conversión
                if (purchasedStd.unit !== usedStd.unit) {
                     toggleWarning(generalWarning, `No se pudo convertir '${purchasedUnitValue}' a '${usedUnitValue}' para el cálculo.`);
                     resultDiv.classList.add("hidden");
                     return;
                }

                if (purchasedStd.quantity === 0) {
                    toggleWarning(generalWarning, "La cantidad comprada base es cero.");
                    resultDiv.classList.add("hidden");
                    return;
                }

                const costPerBaseUnit = totalPrice / purchasedStd.quantity;
                finalCost = costPerBaseUnit * usedStd.quantity;

                calculationMessage = `Usar ${usedQuantity} ${usedUnitSelect.options[usedUnitSelect.selectedIndex]?.text || usedUnitValue} de "${name}" te cuesta ${formatCurrency(finalCost)}.`;
            }

            // Mostrar resultado si el cálculo fue exitoso
            if (!isNaN(finalCost)) {
                resultText.textContent = calculationMessage;
                resultDiv.classList.remove("hidden");
            } else {
                resultDiv.classList.add("hidden");
            }
        };

        // Event listener para cambiar entre tipo de cálculo Placa/General
        materialTypeSelect.addEventListener("change", () => {
            const isPlaca = materialTypeSelect.value === "placa";
            placaInputsDiv.classList.toggle("hidden", !isPlaca);
            generalInputsDiv.classList.toggle("hidden", isPlaca);
            // Limpiar el resultado y warnings al cambiar de tipo
            resultDiv.classList.add("hidden");
            toggleWarning(generalWarning);
            toggleWarning(placaWarning);
            // Recalcular (o limpiar si no hay datos)
            // calculateIndividualCost(); // Opcional: recalcular inmediatamente o esperar input
        });

        // Event listeners para recalcular
        [nameInput, totalPriceInput,
         purchasedPlacaWidthInput, purchasedPlacaHeightInput, purchasedPlacaUnitSelect, cutWidthInput, cutHeightInput, // Placa
         purchasedQuantityInput, purchasedUnitSelect, usedQuantityInput, usedUnitSelect // General
        ].forEach(el => {
            el?.addEventListener("input", calculateIndividualCost);
            // 'change' es mejor para selects que 'input'
            if (el?.tagName === 'SELECT') {
                 el.removeEventListener("input", calculateIndividualCost); // Remover listener 'input' si se añadió
                 el.addEventListener("change", calculateIndividualCost);
            }
        });

        // Listener específico para actualizar #usedUnit cuando #purchasedUnit cambia (en modo General)
        purchasedUnitSelect?.addEventListener("change", () => {
            updateUsedUnitOptions();
            // No llamamos a calculateIndividualCost aquí porque ya lo hace el listener 'change' general del select
        });


        // Botones Copiar/Compartir
        copyBtn?.addEventListener("click", () => {
            if(resultText.textContent && !resultDiv.classList.contains('hidden')){
                navigator.clipboard.writeText(resultText.textContent)
                  .then(() => {
                    const originalText = copyBtn.textContent;
                    // Podríamos quitar el icono temporalmente
                    copyBtn.innerHTML = "¡Copiado!";
                    setTimeout(() => {
                        // Restaurar texto e icono
                        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512" fill="currentColor" style="margin-right: 0.4em;"><path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16l140.1 0L400 115.9V320c0 8.8-7.2 16-16 16zM192 384H384c35.3 0 64-28.7 64-64V115.9c0-12.7-5.1-24.9-14.1-33.9L366.1 14.1c-9-9-21.2-14.1-33.9-14.1H192c-35.3 0-64 28.7-64 64V320c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H256c35.3 0 64-28.7 64-64V416H272c-8.8 0-16-7.2-16-16s7.2-16 16-16H320V256H192c-17.7 0-32-14.3-32-32V192H128V128H64z"/></svg> Copiar`;
                    }, 2000);
                  })
                  .catch(err => console.error('Error al copiar: ', err));
            }
        });
        shareBtn?.addEventListener("click", () => {
            if(resultText.textContent && !resultDiv.classList.contains('hidden')){
                const textToShare = resultText.textContent;
                if (navigator.share) { // Usar API Share si está disponible
                    navigator.share({
                        title: 'Cálculo Costo Material',
                        text: textToShare,
                    }).catch(err => console.error('Error al compartir: ', err));
                } else { // Fallback a WhatsApp
                    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(textToShare)}`;
                    window.open(whatsappUrl, "_blank");
                }
            }
        });

        // Inicialización
        // Ocultar/mostrar según el tipo inicial
        const initialType = materialTypeSelect.value;
        placaInputsDiv.classList.toggle("hidden", initialType !== "placa");
        generalInputsDiv.classList.toggle("hidden", initialType === "placa");
        // Poblar #usedUnit inicialmente
        updateUsedUnitOptions();
        // Calcular costo inicial si hay valores
        // calculateIndividualCost(); // Descomentar si quieres un cálculo al cargar la página
    };

    // --- Calculadora de Gastos Fijos del Taller ---
    const initFixedCostsCalculator = () => {
        const fixedCostInputIds = [
            "rent", "services", "taxes", "salary", "marketing", "amortization", "other-fixed"
        ];
        const monthlyFixedTotalSpan = document.getElementById("monthly-fixed-total");
        const monthlyProductsInput = document.getElementById("monthly-products");
        const fixedPerProductSpan = document.getElementById("fixed-per-product");
        // Para actualizar el ejemplo
        const finalFixedCostExampleSpan = document.getElementById("final-fixed-costs-example");

        if (!monthlyFixedTotalSpan || !monthlyProductsInput || !fixedPerProductSpan) {
            console.warn("Elementos de la calculadora de gastos fijos no encontrados.");
            return;
        }

        let currentFixedCostPerProduct = 0;

        const calculateFixedCosts = () => {
            let totalMonthlyFixed = 0;
            fixedCostInputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    totalMonthlyFixed += parseFloatInput(input.value); // Usar parseFloatInput para manejar errores y negativos
                } else {
                    console.warn(`Input con ID ${id} no encontrado en gastos fijos.`);
                }
            });

            // Usar textContent para mostrar, no innerHTML si no necesitas HTML
            monthlyFixedTotalSpan.textContent = formatCurrency(totalMonthlyFixed);

            const monthlyProducts = parseIntInput(monthlyProductsInput.value, 1); // Asegura que sea al menos 1
            // Evitar división por cero explícitamente aunque parseIntInput ya previene < 1
            currentFixedCostPerProduct = monthlyProducts > 0 ? totalMonthlyFixed / monthlyProducts : 0;

            fixedPerProductSpan.textContent = formatCurrency(currentFixedCostPerProduct);

            // Actualizar también en el ejemplo detallado, si existe
            if (finalFixedCostExampleSpan) {
                finalFixedCostExampleSpan.textContent = formatCurrency(currentFixedCostPerProduct);
                // Si el ejemplo detallado tiene una función para recalcular todo, llamarla.
                // Asegurarse que updateFinalCostExample esté definida globalmente o accesible.
                if (typeof window.updateFinalCostExample === "function") {
                    window.updateFinalCostExample();
                }
            }
        };

        // Añadir listeners a todos los inputs relevantes
        fixedCostInputIds.forEach(id => {
            const input = document.getElementById(id);
            input?.addEventListener("input", calculateFixedCosts);
        });
        monthlyProductsInput?.addEventListener("input", calculateFixedCosts);

        // Calcular al cargar la página
        calculateFixedCosts();
    };


    // --- Ejemplo Práctico Mueble (Interactivo) ---
    // Esta función se llamará 'updateFinalCostExample' globalmente
    window.updateFinalCostExample = () => {
        const getNumericValue = (elementId) => {
            const element = document.getElementById(elementId);
            // Limpiar formato de moneda ($ y puntos de miles) y convertir coma decimal a punto
             return element ? parseFloatInput(element.textContent?.replace(/[$.]/g, '').replace(',', '.')) : 0;
        };

        // Obtener todos los costos parciales del ejemplo
        const materialsCost = getNumericValue("materials-total-example");
        const processCost = getNumericValue("process-total-example");
        const finishesCost = getNumericValue("finishes-total-example");
        const packagingCost = getNumericValue("packaging-total-example");
        const timeCost = getNumericValue("time-value-example");
        const fixedCostPortion = getNumericValue("final-fixed-costs-example"); // Se actualiza desde fixedCosts

        const subtotalMaterialsTime = materialsCost + processCost + finishesCost + packagingCost + timeCost;
        const totalCost = subtotalMaterialsTime + fixedCostPortion;

        // Actualizar spans en la tabla final
        const subtotalSpan = document.getElementById("subtotal-example");
        const totalCostSpan = document.getElementById("total-cost-example");
        if(subtotalSpan) subtotalSpan.textContent = formatCurrency(subtotalMaterialsTime);
        if(totalCostSpan) totalCostSpan.textContent = formatCurrency(totalCost);


        // Calcular Ganancia y Precio Final
        const profitPercentageInput = document.getElementById("profit-percentage-example");
        const profitPercentageDisplay = document.getElementById("profit-percentage-value-example");
        const profitAmountSpan = document.getElementById("profit-amount-example");
        const finalPriceSpan = document.getElementById("final-price-example");
        const portionsInputEx = document.getElementById("portions-example");
        const portionPriceSpan = document.getElementById("portion-price-example");

        if (!profitPercentageInput || !profitPercentageDisplay || !profitAmountSpan || !finalPriceSpan || !portionsInputEx || !portionPriceSpan) {
             console.warn("Elementos del cálculo final del ejemplo no encontrados.");
             return; // Salir si falta algún elemento crucial
        }


        const profitPercentage = parseFloatInput(profitPercentageInput.value);
        profitPercentageDisplay.textContent = `${profitPercentage}%`;

        const profitAmount = totalCost * (profitPercentage / 100);
        const finalPriceTotal = totalCost + profitAmount; // Precio para todas las porciones

        const portions = parseIntInput(portionsInputEx.value, 1);
        const portionPrice = portions > 0 ? finalPriceTotal / portions : 0;

        profitAmountSpan.textContent = formatCurrency(profitAmount);
        finalPriceSpan.textContent = formatCurrency(finalPriceTotal); // Mostrar precio total calculado
        portionPriceSpan.textContent = formatCurrency(portionPrice); // Mostrar precio unitario
    };


    const initFurnitureExampleCalculator = () => {
        const tabsContainer = document.querySelector(".cake-tabs");
        if (!tabsContainer) return;

        const tabBtns = tabsContainer.querySelectorAll(".tab-btn");
        const tabContents = tabsContainer.querySelectorAll(".tab-content");
        const nextTabBtns = tabsContainer.querySelectorAll(".next-tab-btn");
        const prevTabBtns = tabsContainer.querySelectorAll(".prev-tab-btn");

        const switchTab = (targetTabId) => {
            tabContents.forEach(content => content.classList.remove("active"));
            tabBtns.forEach(btn => btn.classList.remove("active"));
            const newActiveTabContent = document.getElementById(`${targetTabId}-tab`);
            const newActiveTabBtn = tabsContainer.querySelector(`.tab-btn[data-tab="${targetTabId}"]`);

            if (newActiveTabContent) {
                newActiveTabContent.classList.add("active");
                // Scroll a la parte superior del contenido de la pestaña en móviles
                if (window.innerWidth < 768) {
                    newActiveTabContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
            newActiveTabBtn?.classList.add("active");
        };

        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => switchTab(btn.dataset.tab));
        });
        nextTabBtns.forEach(btn => {
            btn.addEventListener("click", () => switchTab(btn.dataset.next));
        });
        prevTabBtns.forEach(btn => {
            btn.addEventListener("click", () => switchTab(btn.dataset.prev));
        });

        // --- Lógica específica del ejemplo ---

        // Función auxiliar para añadir/eliminar filas en tablas de ejemplo
        const setupEditableTable = (tbodyId, totalSpanId, finalSpanId, addBtnId, formPrefix, updateTotalsFunc) => {
            const tbody = document.getElementById(tbodyId);
            const addBtn = document.getElementById(addBtnId);
            if (!tbody || !addBtn) return; // No continuar si los elementos no existen

            // Eliminar filas existentes
            tbody.addEventListener('click', (e) => {
                if (e.target && e.target.classList.contains('btn-delete-row')) {
                    e.target.closest('tr').remove();
                    updateTotalsFunc();
                }
            });

            // Añadir fila (la lógica específica de añadir se maneja fuera)
            addBtn.addEventListener('click', () => {
                // La lógica de añadir (addMaterialExample, addFinishExample, etc.)
                // debe llamarse aquí o estar en el listener del botón directamente.
            });
        };

        // Función auxiliar para actualizar totales (reemplaza las individuales)
        const updateTableTotal = (tbodyId, totalSpanId, finalSpanId, costColumnIndex = 4) => {
            const tbody = document.getElementById(tbodyId);
            const totalSpan = document.getElementById(totalSpanId);
            const finalSpan = document.getElementById(finalSpanId);
            if (!tbody || !totalSpan) return 0;

            let total = 0;
            tbody.querySelectorAll("tr").forEach(row => {
                const costCell = row.cells[costColumnIndex];
                if (costCell) {
                    // Limpiar formato antes de parsear
                     total += parseFloatInput(costCell.textContent?.replace(/[$.]/g, '').replace(',', '.'));
                }
            });

            totalSpan.textContent = formatCurrency(total);
            if (finalSpan) finalSpan.textContent = formatCurrency(total);
            window.updateFinalCostExample(); // Recalcular todo el final
            return total;
        };

        // 1. Materiales (Pestaña 1)
        const materialsTbody = document.getElementById("materials-tbody-example");
        const addMaterialBtnEx = document.getElementById("add-material-btn-example");
        const exMatName = document.getElementById("ex-mat-name");
        const exMatTotalQty = document.getElementById("ex-mat-total-qty");
        const exMatTotalUnit = document.getElementById("ex-mat-total-unit");
        const exMatPrice = document.getElementById("ex-mat-price");
        const exMatUsedQty = document.getElementById("ex-mat-used-qty");
        const exMatUsedUnit = document.getElementById("ex-mat-used-unit");
        const exMatUnitWarning = document.getElementById("ex-mat-unit-warning");

        const updateMaterialsTotalExample = () => updateTableTotal("materials-tbody-example", "materials-total-example", "final-materials-example", 4);

        const addMaterialExample = () => {
            toggleWarning(exMatUnitWarning); // Limpiar warning
            const name = exMatName.value.trim() || "Material sin nombre";
            const totalQty = parseFloatInput(exMatTotalQty.value);
            const totalUnit = exMatTotalUnit.value;
            const price = parseFloatInput(exMatPrice.value);
            const usedQty = parseFloatInput(exMatUsedQty.value);
            const usedUnit = exMatUsedUnit.value;

            if (totalQty <= 0 || price <= 0 || usedQty < 0) { alert("Completá datos del material (cantidades > 0, precio > 0)."); return; }

            if (!areUnitsCompatibleMuebles(totalUnit, usedUnit)) {
                 toggleWarning(exMatUnitWarning, `Unidades '${exMatTotalUnit.options[exMatTotalUnit.selectedIndex].text}' y '${exMatUsedUnit.options[exMatUsedUnit.selectedIndex].text}' no compatibles.`);
                 return;
            }

            const baseTotal = convertToStandardBase(totalQty, totalUnit);
            const baseUsed = convertToStandardBase(usedQty, usedUnit);
            let itemCost = 0;
            if (baseTotal.quantity > 0 && baseTotal.unit === baseUsed.unit) { itemCost = (price / baseTotal.quantity) * baseUsed.quantity; }
            else { /* Error o caso no manejado */ console.warn("No se pudo calcular costo de material en ejemplo"); }


            const newRow = materialsTbody.insertRow();
            newRow.innerHTML = `
                <td>${name}</td>
                <td>${totalQty} ${exMatTotalUnit.options[exMatTotalUnit.selectedIndex].text}</td>
                <td>${formatCurrency(price)}</td>
                <td>${usedQty} ${exMatUsedUnit.options[exMatUsedUnit.selectedIndex].text}</td>
                <td>${formatCurrency(itemCost)}</td>
                <td><button class="btn-delete-row">X</button></td>`;
            // Limpiar formulario
            exMatName.value = ""; exMatTotalQty.value = ""; exMatPrice.value = ""; exMatUsedQty.value = "";
            updateMaterialsTotalExample();
        };
        addMaterialBtnEx?.addEventListener("click", addMaterialExample);
        exMatTotalUnit?.addEventListener("change", () => updateCompatibleUsedUnits(exMatTotalUnit, exMatUsedUnit)); // Usa la función genérica
        exMatUsedUnit?.addEventListener("change", () => { // Revalidar compatibilidad visualmente
            toggleWarning(exMatUnitWarning, areUnitsCompatibleMuebles(exMatTotalUnit.value, exMatUsedUnit.value) ? "" : "Unidades no compatibles.");
        });
        // Configurar eliminación de filas iniciales y totales
        setupEditableTable("materials-tbody-example", "materials-total-example", "final-materials-example", "add-material-btn-example", "ex-mat-", updateMaterialsTotalExample);


        // 2. Procesos y Energía (Pestaña 2)
        const machinePowerAvgInput = document.getElementById("machine-power-avg");
        const processTimeInput = document.getElementById("process-time");
        const electricityCostKwhInput = document.getElementById("electricity-cost-kwh");
        const machineElectricityResultSpan = document.getElementById("machine-electricity-result");
        const consumablesCostInput = document.getElementById("consumables-cost");
        const consumablesResultSpan = document.getElementById("consumables-result");
        const toolTotalCostInput = document.getElementById("tool-total-cost");
        const toolLifespanProjectsInput = document.getElementById("tool-lifespan-projects");
        const toolAmortizationResultSpan = document.getElementById("tool-amortization-result");
        const processTotalSpan = document.getElementById("process-total-example");
        const finalProcessSpan = document.getElementById("final-process-example");

        const calculateProcessCostsExample = () => {
            const power = parseFloatInput(machinePowerAvgInput.value);
            const time = parseFloatInput(processTimeInput.value); // en minutos
            const costKwh = parseFloatInput(electricityCostKwhInput.value);
            const consumables = parseFloatInput(consumablesCostInput.value);
            const toolCost = parseFloatInput(toolTotalCostInput.value);
            const toolLifespan = parseIntInput(toolLifespanProjectsInput.value, 1);

            const electricityCost = (power / 1000) * (time / 60) * costKwh;
            const amortizationCost = toolLifespan > 0 ? toolCost / toolLifespan : 0;

            if(machineElectricityResultSpan) machineElectricityResultSpan.textContent = formatCurrency(electricityCost);
            if(consumablesResultSpan) consumablesResultSpan.textContent = formatCurrency(consumables);
            if(toolAmortizationResultSpan) toolAmortizationResultSpan.textContent = formatCurrency(amortizationCost);

            const totalProcess = electricityCost + consumables + amortizationCost;
            if(processTotalSpan) processTotalSpan.textContent = formatCurrency(totalProcess);
            if(finalProcessSpan) finalProcessSpan.textContent = formatCurrency(totalProcess);
            window.updateFinalCostExample();
        };
        [machinePowerAvgInput, processTimeInput, electricityCostKwhInput, consumablesCostInput, toolTotalCostInput, toolLifespanProjectsInput].forEach(el => {
            el?.addEventListener("input", calculateProcessCostsExample);
        });


        // 3. Acabados (Pestaña 3) - Similar a Materiales
        const finishesTbody = document.getElementById("finishes-tbody-example");
        const addFinishBtnEx = document.getElementById("add-finish-btn-example");
        const exFinishName = document.getElementById("ex-finish-name");
        const exFinishTotalQty = document.getElementById("ex-finish-total-qty");
        const exFinishTotalUnit = document.getElementById("ex-finish-total-unit");
        const exFinishPrice = document.getElementById("ex-finish-price");
        const exFinishUsedQty = document.getElementById("ex-finish-used-qty");
        const exFinishUsedUnit = document.getElementById("ex-finish-used-unit");
        const exFinishUnitWarning = document.getElementById("ex-finish-unit-warning");

        const updateFinishesTotalExample = () => updateTableTotal("finishes-tbody-example", "finishes-total-example", "final-finishes-example", 4);

        const addFinishExample = () => {
             toggleWarning(exFinishUnitWarning);
             const name = exFinishName.value.trim() || "Acabado sin nombre";
             const totalQty = parseFloatInput(exFinishTotalQty.value);
             const totalUnit = exFinishTotalUnit.value;
             const price = parseFloatInput(exFinishPrice.value);
             const usedQty = parseFloatInput(exFinishUsedQty.value);
             const usedUnit = exFinishUsedUnit.value;

             if (totalQty <= 0 || price <= 0 || usedQty < 0) { alert("Completá datos del acabado."); return; }
             if (!areUnitsCompatibleMuebles(totalUnit, usedUnit)) { toggleWarning(exFinishUnitWarning, `Unidades no compatibles.`); return; }

             const baseTotal = convertToStandardBase(totalQty, totalUnit);
             const baseUsed = convertToStandardBase(usedQty, usedUnit);
             let itemCost = 0;
             if (baseTotal.quantity > 0 && baseTotal.unit === baseUsed.unit) { itemCost = (price / baseTotal.quantity) * baseUsed.quantity; }

             const newRow = finishesTbody.insertRow();
             newRow.innerHTML = `
                 <td>${name}</td>
                 <td>${totalQty} ${exFinishTotalUnit.options[exFinishTotalUnit.selectedIndex].text}</td>
                 <td>${formatCurrency(price)}</td>
                 <td>${usedQty} ${exFinishUsedUnit.options[exFinishUsedUnit.selectedIndex].text}</td>
                 <td>${formatCurrency(itemCost)}</td>
                 <td><button class="btn-delete-row">X</button></td>`;
             exFinishName.value = ""; exFinishTotalQty.value = ""; exFinishPrice.value = ""; exFinishUsedQty.value = "";
             updateFinishesTotalExample();
        };
        addFinishBtnEx?.addEventListener("click", addFinishExample);
        exFinishTotalUnit?.addEventListener("change", () => updateCompatibleUsedUnits(exFinishTotalUnit, exFinishUsedUnit));
        exFinishUsedUnit?.addEventListener("change", () => { toggleWarning(exFinishUnitWarning, areUnitsCompatibleMuebles(exFinishTotalUnit.value, exFinishUsedUnit.value) ? "" : "Unidades no compatibles."); });
        setupEditableTable("finishes-tbody-example", "finishes-total-example", "final-finishes-example", "add-finish-btn-example", "ex-finish-", updateFinishesTotalExample);

        // 4. Embalaje (Pestaña 4)
        const packagingTbody = document.getElementById("packaging-tbody-example");
        const addPackagingBtnEx = document.getElementById("add-packaging-btn-example");
        const exPackName = document.getElementById("ex-pack-name");
        const exPackPrice = document.getElementById("ex-pack-price");
        const exPackQty = document.getElementById("ex-pack-qty");

        const updatePackagingTotalExample = () => updateTableTotal("packaging-tbody-example", "packaging-total-example", "final-packaging-example", 3); // Costo es columna 3

        const addPackagingExample = () => {
            const name = exPackName.value.trim() || "Embalaje sin nombre";
            const unitPrice = parseFloatInput(exPackPrice.value);
            const qty = parseIntInput(exPackQty.value, 1);
            if (unitPrice <= 0 || qty <= 0) { alert("Completá datos del embalaje."); return; }
            const itemCost = unitPrice * qty;
            const newRow = packagingTbody.insertRow();
            newRow.innerHTML = `
                <td>${name}</td>
                <td>${formatCurrency(unitPrice)}</td>
                <td>${qty}</td>
                <td>${formatCurrency(itemCost)}</td>
                <td><button class="btn-delete-row">X</button></td>`;
            exPackName.value = ""; exPackPrice.value = ""; exPackQty.value = "1";
            updatePackagingTotalExample();
        };
        addPackagingBtnEx?.addEventListener("click", addPackagingExample);
        setupEditableTable("packaging-tbody-example", "packaging-total-example", "final-packaging-example", "add-packaging-btn-example", "ex-pack-", updatePackagingTotalExample);


        // 5. Tiempo de Laburo (Pestaña 5)
        const timeInputsEx = tabsContainer.querySelectorAll(".time-input-example");
        const hourlyRateInputEx = document.getElementById("hourly-rate-example");
        const totalTimeSpanEx = document.getElementById("total-time-example");
        const timeValueSpanEx = document.getElementById("time-value-example");
        const finalTimeSpan = document.getElementById("final-time-example");

        const calculateTimeCostExample = () => {
            let totalMinutes = 0;
            timeInputsEx.forEach(input => {
                totalMinutes += parseIntInput(input.value, 0); // Permitir 0 minutos
            });
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            if (totalTimeSpanEx) totalTimeSpanEx.textContent = `${hours} hs ${minutes} min`;

            const hourlyRate = parseFloatInput(hourlyRateInputEx.value);
            const timeCost = (totalMinutes / 60) * hourlyRate;
            if (timeValueSpanEx) timeValueSpanEx.textContent = formatCurrency(timeCost);
            if (finalTimeSpan) finalTimeSpan.textContent = formatCurrency(timeCost);
            window.updateFinalCostExample();
        };
        timeInputsEx.forEach(input => input.addEventListener("input", calculateTimeCostExample));
        hourlyRateInputEx?.addEventListener("input", calculateTimeCostExample);


        // 6. Pestaña Final y Recalcular Todo el Ejemplo
        const profitPercentageInputEx = document.getElementById("profit-percentage-example");
        const portionsInputEx = document.getElementById("portions-example");
        profitPercentageInputEx?.addEventListener("input", window.updateFinalCostExample);
        portionsInputEx?.addEventListener("input", window.updateFinalCostExample);

        const recalculateExampleBtn = document.getElementById("recalculate-example-btn");
        recalculateExampleBtn?.addEventListener("click", () => {
            // Llama a todas las funciones de actualización de totales que a su vez llaman a updateFinalCostExample
            updateMaterialsTotalExample();
            calculateProcessCostsExample();
            updateFinishesTotalExample();
            updatePackagingTotalExample();
            calculateTimeCostExample();
            // Asegurarse que el costo fijo también se actualice por si acaso
            const fixedCostCalcInput = document.getElementById("fixed-per-product");
            const fixedCostExampleDisplay = document.getElementById("final-fixed-costs-example");
             if(fixedCostCalcInput && fixedCostExampleDisplay) {
                fixedCostExampleDisplay.textContent = fixedCostCalcInput.textContent;
             }
            window.updateFinalCostExample(); // Llamada final explícita
        });


        // --- Inicialización del Ejemplo ---
        // Usa la función genérica para actualizar selects dependientes
        const updateCompatibleUsedUnitsForExample = (totalUnitSelectId, usedUnitSelectId, defaultUnit = null) => {
             const totalSelect = document.getElementById(totalUnitSelectId);
             const usedSelect = document.getElementById(usedUnitSelectId);
             if (totalSelect && usedSelect) {
                 // Necesitamos una función que copie opciones, no la de compatibilidad
                 const currentUsedUnitValue = usedSelect.value;
                 usedSelect.innerHTML = "";
                 Array.from(totalSelect.options).forEach(option => {
                     const newOption = document.createElement("option");
                     newOption.value = option.value;
                     newOption.textContent = option.textContent;
                     usedSelect.appendChild(newOption);
                 });
                 if (Array.from(usedSelect.options).some(opt => opt.value === currentUsedUnitValue)) {
                     usedSelect.value = currentUsedUnitValue;
                 } else if (defaultUnit && Array.from(usedSelect.options).some(opt => opt.value === defaultUnit)) {
                     usedSelect.value = defaultUnit;
                 } else if (usedSelect.options.length > 0) {
                     usedSelect.value = usedSelect.options[0].value;
                 }
             }
         };

        updateCompatibleUsedUnitsForExample('ex-mat-total-unit', 'ex-mat-used-unit', 'm');
        updateCompatibleUsedUnitsForExample('ex-finish-total-unit', 'ex-finish-used-unit', 'ml');


        // Calcular todos los totales iniciales del ejemplo al cargar
        updateMaterialsTotalExample();
        calculateProcessCostsExample();
        updateFinishesTotalExample();
        updatePackagingTotalExample();
        calculateTimeCostExample();
        // Llamada final para asegurar cálculo de precio final inicial
        window.updateFinalCostExample();
    };


    // --- Inicialización General ---
    setCurrentYear();
    initIndividualMaterialCalculator(); // Inicializar Calculadora Rápida
    initFixedCostsCalculator(); // Inicializar Gastos Fijos (importante que corra ANTES que el ejemplo si este depende del valor inicial)
    initFurnitureExampleCalculator(); // Inicializar Ejemplo Práctico

}); // Fin del DOMContentLoaded
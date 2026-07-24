/**
 * informeCalculos.ts
 * 
 * Lógica de cálculo para el Indicador de Producción.
 * 
 * Fórmulas replicadas exactamente del Excel:
 * 
 * DIA X MAESTRO (D) = MAESTROS (B) × DIAS TRAB (C)
 * OBS DIA X MAESTRO (F) = OBS SUBSANADAS (E) / DIA X MAESTRO (D)
 * PRODUCTIVIDAD (G) = IF(D>0, (E/D)/N, "0%")  [N = obs óptimas diarias]
 * PONDERACIÓN (H) = IF(D>0, DIAS TRAB / SUM(DIAS), "%")
 * PROMEDIO PONDERADO (I) = IF(D>0, G×H, "%")
 * 
 * Para ÓPTIMO:
 * - Suma de valores de PRE-E y PV (excepto OBS DIA X MAESTRO y PRODUCTIVIDAD)
 * - OBS DIA X MAESTRO ÓPTIMO = (DIAS_PV × OBS_OPT_PV + DIAS_PRE-E × OBS_OPT_PRE-E) / (DIAS_PRE-E + DIAS_PV)
 * - PRODUCTIVIDAD ÓPTIMO = SUM(PRODUCTIVIDAD PRE-E + PV)
 */

export interface FilaIndicador {
  maestros: number;
  diasTrab: number;
  diaXMaestro: number;
  obsSubsanadas: number;  // Siempre número
  obsDiaXMaestro: number;
  productividad: string;
  ponderacion: string;
  promedioPonderado: string;
}

export interface IndicadorCalculos {
  preE: FilaIndicador;
  pv: FilaIndicador;
  optimo: FilaIndicador;
  productividadPromedioDiaria: string;
}

interface InputsIndicador {
  preE_maestros: number;
  preE_diasTrab: number;
  preE_obsSubsanadas: number;
  preE_obsOptimas: number;

  pv_maestros: number;
  pv_diasTrab: number;
  pv_obsSubsanadas: number;
  pv_obsOptimas: number;
}

/**
 * Formatea un número como porcentaje
 */
const formatearPorcentaje = (valor: number): string => {
  if (isNaN(valor) || !isFinite(valor)) {
    return '0%';
  }
  return `${Math.round(valor * 100)}%`;
};

/**
 * Calcula una fila del indicador (PRE-E o PV)
 */
const calcularFila = (
  maestros: number,
  diasTrab: number,
  obsSubsanadas: number,
  obsOptimas: number,
  totalDiasTrab: number
): FilaIndicador => {
  // D = MAESTROS × DIAS TRAB
  const diaXMaestro = maestros * diasTrab;

  // F = OBS SUBSANADAS / DIA X MAESTRO
  const obsDiaXMaestro = diaXMaestro > 0 ? obsSubsanadas / diaXMaestro : 0;

  // G = PRODUCTIVIDAD = (OBS SUBSANADAS / DIA X MAESTRO) / OBS ÓPTIMAS DIARIAS
  // Simplificado: (E/D) / N = E / (D × N)
  let productividad = '0%';
  if (diaXMaestro > 0 && obsOptimas > 0) {
    const prod = (obsSubsanadas / diaXMaestro) / obsOptimas;
    productividad = formatearPorcentaje(prod);
  }

  // H = PONDERACIÓN = DIAS TRAB / SUM(DIAS TRAB)
  let ponderacion = '0%';
  if (totalDiasTrab > 0) {
    const pond = diasTrab / totalDiasTrab;
    ponderacion = formatearPorcentaje(pond);
  }

  // I = PROMEDIO PONDERADO = PRODUCTIVIDAD × PONDERACIÓN
  let promedioPonderado = '0%';
  if (diaXMaestro > 0 && totalDiasTrab > 0) {
    // Convertir porcentajes a decimales
    const prodNum = parseFloat(productividad) / 100;
    const pondNum = parseFloat(ponderacion) / 100;
    const promPond = prodNum * pondNum;
    promedioPonderado = formatearPorcentaje(promPond);
  }

  return {
    maestros,
    diasTrab,
    diaXMaestro,
    obsSubsanadas,
    obsDiaXMaestro,
    productividad,
    ponderacion,
    promedioPonderado,
  };
};

/**
 * Calcula el indicador completo
 */
export const calcularIndicador = (inputs: InputsIndicador): IndicadorCalculos => {
  // Totales para ÓPTIMO
  const totalDiasTrab = inputs.preE_diasTrab + inputs.pv_diasTrab;
  const totalMaestros = inputs.preE_maestros + inputs.pv_maestros;

  // Calcular PRE-E
  const preE = calcularFila(
    inputs.preE_maestros,
    inputs.preE_diasTrab,
    inputs.preE_obsSubsanadas,
    inputs.preE_obsOptimas,
    totalDiasTrab
  );

  // Calcular PV
  const pv = calcularFila(
    inputs.pv_maestros,
    inputs.pv_diasTrab,
    inputs.pv_obsSubsanadas,
    inputs.pv_obsOptimas,
    totalDiasTrab
  );

  // Calcular ÓPTIMO
  // DIA X MAESTRO ÓPTIMO = (DIAS_PV × OBS_OPT_PV + DIAS_PRE-E × OBS_OPT_PRE-E) / TOTAL_DIAS
  const diaXMaestroOptimo = totalDiasTrab > 0
    ? (inputs.pv_diasTrab * inputs.pv_obsOptimas +
       inputs.preE_diasTrab * inputs.preE_obsOptimas) / totalDiasTrab
    : 0;

  // OBS SUBSANADAS ÓPTIMO = OBS DIA X MAESTRO ÓPTIMO × DIA X MAESTRO ÓPTIMO
  const obsDiaXMaestroOptimo = diaXMaestroOptimo;  // Ya es el promedio ponderado
  const obsSubsanadasOptimo = Math.round(
    totalMaestros * totalDiasTrab * diaXMaestroOptimo
  );

  // PRODUCTIVIDAD ÓPTIMO = SUM(PRODUCTIVIDAD PRE-E + PV)
  const prodPreENum = parseFloat(preE.productividad) / 100;
  const prodPvNum = parseFloat(pv.productividad) / 100;
  const prodOptimoNum = prodPreENum + prodPvNum;
  const productividadOptimo = formatearPorcentaje(prodOptimoNum);

  // PONDERACIÓN ÓPTIMO = SUM(PONDERACIÓN PRE-E + PV)
  const pondPreENum = parseFloat(preE.ponderacion) / 100;
  const pondPvNum = parseFloat(pv.ponderacion) / 100;
  const pondOptimoNum = pondPreENum + pondPvNum;
  const ponderacionOptimo = formatearPorcentaje(pondOptimoNum);

  // PROMEDIO PONDERADO ÓPTIMO = SUM(PROMEDIO PONDERADO PRE-E + PV)
  const promPreENum = parseFloat(preE.promedioPonderado) / 100;
  const promPvNum = parseFloat(pv.promedioPonderado) / 100;
  const promOptimoNum = promPreENum + promPvNum;
  const promedioPonderadoOptimo = formatearPorcentaje(promOptimoNum);

  const optimo: FilaIndicador = {
    maestros: totalMaestros,
    diasTrab: totalDiasTrab,
    diaXMaestro: totalMaestros * totalDiasTrab,
    obsSubsanadas: obsSubsanadasOptimo,
    obsDiaXMaestro: diaXMaestroOptimo,
    productividad: productividadOptimo,
    ponderacion: ponderacionOptimo,
    promedioPonderado: promedioPonderadoOptimo,
  };

  // PRODUCTIVIDAD PROMEDIO DIARIA
  // Este es el valor que aparece suelto en la hoja (sin etiqueta)
  // En el Excel: =(G13*C13+G14*C14)/(C13+C14)
  // Es el promedio ponderado de las productividades por días trabajados
  let productividadPromedioDiaria = '0%';
  if (totalDiasTrab > 0) {
    const prodPreENum = parseFloat(preE.productividad) / 100;
    const prodPvNum = parseFloat(pv.productividad) / 100;
    const promedioDiario =
      (prodPreENum * inputs.preE_diasTrab + prodPvNum * inputs.pv_diasTrab) /
      totalDiasTrab;
    productividadPromedioDiaria = formatearPorcentaje(promedioDiario);
  }

  return {
    preE,
    pv,
    optimo,
    productividadPromedioDiaria,
  };
};

/**
 * Función auxiliar para validar inputs (checking para debugging)
 */
export const validarInputs = (inputs: InputsIndicador): string[] => {
  const errores: string[] = [];

  if (inputs.preE_maestros < 0) errores.push('PRE-E maestros no puede ser negativo');
  if (inputs.preE_diasTrab < 0) errores.push('PRE-E días no puede ser negativo');
  if (inputs.preE_obsSubsanadas < 0) errores.push('PRE-E obs no puede ser negativo');

  if (inputs.pv_maestros < 0) errores.push('PV maestros no puede ser negativo');
  if (inputs.pv_diasTrab < 0) errores.push('PV días no puede ser negativo');
  if (inputs.pv_obsSubsanadas < 0) errores.push('PV obs no puede ser negativo');

  return errores;
};
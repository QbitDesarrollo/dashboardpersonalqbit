import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export interface TaskForExport {
  titulo_tarea: string;
  marca?: string;
  mesa?: string;
  responsable?: string;
  estado: string;
  prioridad: string;
  fecha_inicio: string | null;
  fecha_entrega: string;
  cantidad_entregables: number;
  tiempo_trabajado: number;
}

const ESTADO_LABELS: Record<string, string> = {
  backlog: 'Pendiente',
  en_proceso: 'En Proceso',
  en_revision: 'En Revisión',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
};

export function exportTasksToCSV(tasks: TaskForExport[], filename = 'tareas.csv') {
  const headers = [
    'Tarea',
    'Marca',
    'Mesa',
    'Responsable',
    'Estado',
    'Prioridad',
    'Fecha inicio',
    'Fecha entrega',
    'Entregables',
    'Tiempo',
  ];
  const rows = tasks.map((t) => [
    t.titulo_tarea,
    t.marca ?? '',
    t.mesa ?? '',
    t.responsable ?? '',
    ESTADO_LABELS[t.estado] ?? t.estado,
    t.prioridad,
    t.fecha_inicio ?? '',
    t.fecha_entrega,
    t.cantidad_entregables,
    formatTime(t.tiempo_trabajado),
  ]);
  const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

export function exportTasksToExcel(tasks: TaskForExport[], filename = 'tareas.xlsx') {
  const data = tasks.map((t) => ({
    Tarea: t.titulo_tarea,
    Marca: t.marca ?? '',
    Mesa: t.mesa ?? '',
    Responsable: t.responsable ?? '',
    Estado: ESTADO_LABELS[t.estado] ?? t.estado,
    Prioridad: t.prioridad,
    'Fecha inicio': t.fecha_inicio ?? '',
    'Fecha entrega': t.fecha_entrega,
    Entregables: t.cantidad_entregables,
    'Tiempo (h)': Math.round((t.tiempo_trabajado / 3600) * 100) / 100,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tareas');
  XLSX.writeFile(wb, filename);
}

export function exportTasksToPDF(tasks: TaskForExport[], filename = 'tareas.pdf') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Reporte de Tareas - TIUSDEI', 14, 12);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString('es-ES')} · ${tasks.length} tareas`, 14, 18);

  const tableData = tasks.map((t) => [
    t.titulo_tarea.substring(0, 40),
    t.marca ?? '-',
    t.responsable ?? '-',
    ESTADO_LABELS[t.estado] ?? t.estado,
    t.prioridad,
    t.fecha_entrega,
    formatTime(t.tiempo_trabajado),
  ]);

  autoTable(doc, {
    head: [['Tarea', 'Marca', 'Responsable', 'Estado', 'Prioridad', 'Entrega', 'Tiempo']],
    body: tableData,
    startY: 24,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35 },
      3: { cellWidth: 25 },
      4: { cellWidth: 20 },
      5: { cellWidth: 25 },
      6: { cellWidth: 22 },
    },
  });

  doc.save(filename);
}

// ========== Daily de Mesas Exports ==========

interface DailyMember {
  nombre: string;
  total: number;
  enProceso: number;
  enRevision: number;
  entregadas: number;
  atrasadas: number;
  bloqueadas: number;
  tiempoTrabajado: number;
  byDeliverableType: Record<string, number>;
}

interface DailyTask {
  titulo_tarea: string;
  estado: string;
  prioridad: string;
  fecha_entrega: string;
  tiempo_trabajado: number;
  brands?: { nombre: string };
  responsables?: { nombre: string }[];
  responsable_user_id?: string | null;
  deliverable_type?: { nombre: string } | null;
  tipo_entregable_id?: string | null;
}

export function exportDailyToPDF(
  members: DailyMember[],
  tasks: DailyTask[],
  deskName: string,
  dtNameMap: Record<string, string>,
  filename = 'daily-mesas.pdf'
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text(`Daily de Mesas - ${deskName}`, 14, 12);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString('es-ES')} · ${tasks.length} tareas · ${members.length} personas`, 14, 18);

  // Summary table per person
  const summaryData = members.map((m) => [
    m.nombre,
    String(m.total),
    String(m.enProceso),
    String(m.enRevision),
    String(m.entregadas),
    String(m.atrasadas),
    String(m.bloqueadas),
    formatTime(m.tiempoTrabajado),
    Object.entries(m.byDeliverableType).map(([k, v]) => `${k}(${v})`).join(', ') || '-',
  ]);

  autoTable(doc, {
    head: [['Persona', 'Total', 'Proceso', 'Revision', 'Entregadas', 'Atrasadas', 'Bloq.', 'Tiempo', 'Tipos Entregable']],
    body: summaryData,
    startY: 24,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 35 },
      8: { cellWidth: 55 },
    },
  });

  // Task detail table on next page
  doc.addPage();
  doc.setFontSize(12);
  doc.text('Detalle de Tareas', 14, 12);

  const taskData = tasks.map((t) => [
    t.titulo_tarea.substring(0, 35),
    t.brands?.nombre || '-',
    t.responsables?.[0]?.nombre || '-',
    t.deliverable_type?.nombre || (t.tipo_entregable_id ? (dtNameMap[t.tipo_entregable_id] || '-') : '-'),
    ESTADO_LABELS[t.estado] ?? t.estado,
    t.prioridad,
    (t.fecha_entrega || "").substring(0, 10),
    formatTime(t.tiempo_trabajado),
  ]);

  autoTable(doc, {
    head: [['Tarea', 'Marca', 'Responsable', 'Tipo Entreg.', 'Estado', 'Prioridad', 'Entrega', 'Tiempo']],
    body: taskData,
    startY: 18,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 45 },
    },
  });

  doc.save(filename);
}

export function exportDailyToExcel(
  members: DailyMember[],
  tasks: DailyTask[],
  deskName: string,
  dtNameMap: Record<string, string>,
  filename = 'daily-mesas.xlsx'
) {
  // Sheet 1: Summary per person
  const summaryData = members.map((m) => ({
    Persona: m.nombre,
    'Total Tareas': m.total,
    'En Proceso': m.enProceso,
    'En Revision': m.enRevision,
    Entregadas: m.entregadas,
    Atrasadas: m.atrasadas,
    Bloqueadas: m.bloqueadas,
    'Tiempo (h)': Math.round((m.tiempoTrabajado / 3600) * 100) / 100,
    'Tipos Entregable': Object.entries(m.byDeliverableType).map(([k, v]) => `${k}(${v})`).join(', ') || '-',
  }));
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);

  // Sheet 2: Task detail
  const taskData = tasks.map((t) => ({
    Tarea: t.titulo_tarea,
    Marca: t.brands?.nombre || '-',
    Responsable: t.responsables?.[0]?.nombre || '-',
    'Tipo Entregable': t.deliverable_type?.nombre || (t.tipo_entregable_id ? (dtNameMap[t.tipo_entregable_id] || '-') : '-'),
    Estado: ESTADO_LABELS[t.estado] ?? t.estado,
    Prioridad: t.prioridad,
    'Fecha Entrega': (t.fecha_entrega || "").substring(0, 10),
    'Tiempo (h)': Math.round((t.tiempo_trabajado / 3600) * 100) / 100,
  }));
  const wsTasks = XLSX.utils.json_to_sheet(taskData);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tareas');
  XLSX.writeFile(wb, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

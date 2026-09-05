import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Eye,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Trash2,
  Truck,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { getApiErrorMessage } from "../../core/api/errors";
import { PERMISSIONS, usePermissions } from "../../core/auth/permissions";
import { showConfirm, showToast } from "../../core/utils/toast";
import { printingService } from "./printing.service";
import { routeLookupService } from "../logistica/route-lookup/routeLookup.service";
import {
  normalizeRouteId,
  uniqueLocalities,
} from "../logistica/route-lookup/domain";
import type { UrbanoRecord } from "../logistica/route-lookup/types";
import type {
  LabelDesign,
  PackageLabel,
  PrintAgent,
  PrintJob,
  PrintJobStatus,
  PrintPairing,
  PrintSite,
} from "./types";
import styles from "./Printing.module.css";

type EditableLabel = PackageLabel & { id: string };
const weekDays = [
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
];
const todayIndex = new Date().getDay();
const defaultDay = weekDays[todayIndex === 0 ? 6 : todayIndex - 1] ?? "LUNES";
const newLabel = (sequence = "1"): EditableLabel => ({
  id: crypto.randomUUID(),
  sequence,
  recipient: "",
  phone: "",
});
const defaultDesign: LabelDesign = {
  brand: "MyG",
  subtitle: "EXPRESS",
  font_family: "ARIAL",
  recipient_size: 22,
  phone_size: 43,
  day_size: 19,
  density: 7,
  show_sequence_circle: true,
};
const statusMeta: Record<
  PrintJobStatus,
  { label: string; icon: typeof Clock3; tone: string }
> = {
  PENDIENTE: { label: "En cola", icon: Clock3, tone: "pending" },
  PROCESANDO: { label: "Enviando", icon: RefreshCw, tone: "processing" },
  ENVIADO: { label: "Enviado", icon: CheckCircle2, tone: "success" },
  ERROR: { label: "Revisar", icon: AlertTriangle, tone: "error" },
  CANCELADO: { label: "Cancelado", icon: XCircle, tone: "neutral" },
};
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Lima",
      }).format(new Date(value))
    : "—";
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 9
    ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    : digits.replace(/(.{3})/g, "$1 ").trim();
};

export function Printing() {
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.PRINTING_MANAGE);
  const [sites, setSites] = useState<PrintSite[]>([]);
  const [siteId, setSiteId] = useState("");
  const [reference, setReference] = useState("Paquetes del día");
  const [dispatchDay, setDispatchDay] = useState(defaultDay);
  const [copies, setCopies] = useState(1);
  const [design, setDesign] = useState<LabelDesign>(defaultDesign);
  const [showDesign, setShowDesign] = useState(false);
  const [entryMode, setEntryMode] = useState<"URBANO" | "MANUAL">("URBANO");
  const [activeStep, setActiveStep] = useState<"SOURCE" | "SETUP" | "DESIGN">(
    "SOURCE",
  );
  const [routeId, setRouteId] = useState("");
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeSummary, setRouteSummary] = useState<{
    imported: number;
    omitted: number;
  } | null>(null);
  const [routeRecords, setRouteRecords] = useState<UrbanoRecord[]>([]);
  const [locality, setLocality] = useState("");
  const [labels, setLabels] = useState<EditableLabel[]>([newLabel()]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actingJob, setActingJob] = useState<number | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [pairing, setPairing] = useState<PrintPairing | null>(null);
  const selectedSite = sites.find((site) => String(site.id) === siteId) ?? null;
  const payloadLabels = useMemo<PackageLabel[]>(
    () =>
      labels.map(({ sequence, recipient, phone }) => ({
        sequence: sequence.trim(),
        recipient: recipient.trim(),
        phone: phone.replace(/\D/g, ""),
      })),
    [labels],
  );
  const preview = payloadLabels[0];
  const queueSummary = useMemo(
    () => ({
      active: jobs.filter(
        (job) => job.status === "PENDIENTE" || job.status === "PROCESANDO",
      ).length,
      completed: jobs.filter((job) => job.status === "ENVIADO").length,
      errors: jobs.filter((job) => job.status === "ERROR").length,
    }),
    [jobs],
  );
  const labelSummary = useMemo(() => {
    const complete = payloadLabels.filter(
      (label) => label.sequence && label.recipient && label.phone.length >= 6,
    ).length;
    return { complete, incomplete: payloadLabels.length - complete };
  }, [payloadLabels]);

  const loadSites = useCallback(async (signal?: AbortSignal) => {
    const data = await printingService.sites(signal);
    setSites(data);
    setSiteId((current) => current || String(data[0]?.id ?? ""));
  }, []);
  const loadJobs = useCallback(
    async (id: string, signal?: AbortSignal) =>
      setJobs(id ? await printingService.jobs(Number(id), signal) : []),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    void loadSites(controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) {
          showToast(
            getApiErrorMessage(e, "No se pudo abrir el módulo de impresión."),
            "error",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const timer = setInterval(
      () => void loadSites().catch(() => undefined),
      30000,
    );
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [loadSites]);
  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    void loadJobs(siteId, controller.signal).catch(() => undefined);
    const timer = setInterval(
      () => void loadJobs(siteId).catch(() => undefined),
      8000,
    );
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [loadJobs, siteId]);
  useEffect(() => {
    if (!showSetup || !siteId) return;
    const refresh = () =>
      printingService
        .agents(Number(siteId))
        .then((data) => {
          setAgents(data);
          if (data.length) {
            setPairing(null);
            void loadSites();
          }
        })
        .catch(() => undefined);
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [showSetup, siteId, loadSites]);
  useEffect(() => {
    if (!showHistory) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowHistory(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showHistory]);

  const updateLabel = (id: string, field: keyof PackageLabel, value: string) =>
    setLabels((current) =>
      current.map((label) =>
        label.id === id
          ? {
              ...label,
              [field]:
                field === "phone"
                  ? value.replace(/\D/g, "").slice(0, 15)
                  : value,
            }
          : label,
      ),
    );
  const prepareRouteLabels = (
    records: UrbanoRecord[],
    selectedLocality: string,
    normalizedRoute = routeId,
  ) => {
    const filtered = selectedLocality
      ? records.filter((record) => record.localidad === selectedLocality)
      : records;
    const seen = new Set<string>();
    const valid = filtered.filter((record) => {
      const phone = String(record.telefono ?? "").replace(/\D/g, "");
      const recipient = String(record.cliente ?? "").trim();
      const key = `${record.guia}|${phone}`;
      if (!recipient || phone.length < 6 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const imported = valid.map((record, index) => ({
      id: crypto.randomUUID(),
      sequence: String(index + 1),
      recipient: record.cliente.trim(),
      phone: record.telefono.replace(/\D/g, "").slice(0, 15),
    }));
    setLabels(imported.length ? imported : [newLabel()]);
    setReference(
      `Ruta Urbano ${normalizedRoute}${selectedLocality ? ` · ${selectedLocality}` : ""}`,
    );
    setRouteSummary({
      imported: imported.length,
      omitted: filtered.length - imported.length,
    });
    return imported.length;
  };
  const loadRouteForPrinting = async () => {
    const normalized = normalizeRouteId(routeId);
    if (!normalized)
      return showToast("Ingresa un número de ruta válido.", "warning");
    setLoadingRoute(true);
    setRouteSummary(null);
    try {
      const result = await routeLookupService.lookup(normalized);
      setRouteRecords(result.records);
      setLocality("");
      const imported = prepareRouteLabels(result.records, "", normalized);
      if (!imported)
        return showToast(
          "La ruta no contiene destinatarios con teléfono válido.",
          "warning",
        );
      showToast(`${imported} etiquetas preparadas desde la ruta.`, "success");
    } catch (error) {
      showToast(
        getApiErrorMessage(error, "No se pudo consultar la ruta en Urbano."),
        "error",
      );
    } finally {
      setLoadingRoute(false);
    }
  };
  const validate = () => {
    if (!siteId) return "Selecciona una sede.";
    if (!selectedSite?.agentConfigured)
      return "Configura la impresora de esta sede.";
    if (!reference.trim()) return "Ingresa una referencia para el lote.";
    if (payloadLabels.some((item) => !item.sequence))
      return "Completa el correlativo de cada paquete.";
    if (payloadLabels.some((item) => !item.recipient))
      return "Completa el destinatario de cada paquete.";
    if (payloadLabels.some((item) => item.phone.length < 6))
      return "Cada teléfono debe tener al menos 6 dígitos.";
    return null;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const error = validate();
    if (error) return showToast(error, "warning");
    setSubmitting(true);
    try {
      const chunks: PackageLabel[][] = [];
      for (let index = 0; index < payloadLabels.length; index += 100)
        chunks.push(payloadLabels.slice(index, index + 100));
      const created: PrintJob[] = [];
      for (let index = 0; index < chunks.length; index += 1)
        created.push(
          await printingService.create({
            site_id: Number(siteId),
            reference:
              chunks.length > 1
                ? `${reference.trim()} · ${index + 1}/${chunks.length}`
                : reference.trim(),
            dispatch_day: dispatchDay,
            copies,
            idempotency_key: crypto.randomUUID(),
            labels: chunks[index]!,
            design,
          }),
        );
      setJobs((current) => [
        ...created.toReversed(),
        ...current.filter((item) => !created.some((job) => job.id === item.id)),
      ]);
      setLabels([newLabel()]);
      setRouteSummary(null);
      showToast(
        `${payloadLabels.length * copies} etiquetas agregadas en ${created.length} ${created.length === 1 ? "trabajo" : "trabajos"}.`,
        "success",
      );
    } catch (e) {
      showToast(
        getApiErrorMessage(e, "No se pudo crear la impresión."),
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const runAction = async (job: PrintJob, action: "cancel" | "retry") => {
    const ok = await showConfirm({
      title: action === "retry" ? "Reintentar impresión" : "Cancelar trabajo",
      message:
        action === "retry"
          ? "Confirma que las etiquetas no se imprimieron para evitar duplicados."
          : "El trabajo se retirará de la cola.",
      confirmText: action === "retry" ? "Reintentar" : "Cancelar",
      type: action === "retry" ? "warning" : "danger",
    });
    if (!ok) return;
    setActingJob(job.id);
    try {
      await printingService[action](job.id);
      await loadJobs(siteId);
    } catch (e) {
      showToast(
        getApiErrorMessage(e, "No se pudo actualizar el trabajo."),
        "error",
      );
    } finally {
      setActingJob(null);
    }
  };
  const openSetup = async () => {
    if (!siteId) return;
    setShowSetup(true);
    try {
      setAgents(await printingService.agents(Number(siteId)));
    } catch (e) {
      showToast(
        getApiErrorMessage(e, "No se pudo consultar el conector."),
        "error",
      );
    }
  };
  const savePrinter = async (agent: PrintAgent, printer: string) => {
    try {
      await printingService.selectPrinter(agent.id, printer);
      setAgents(await printingService.agents(Number(siteId)));
      await loadSites();
      showToast("Impresora configurada.", "success");
    } catch (e) {
      showToast(
        getApiErrorMessage(e, "No se pudo seleccionar la impresora."),
        "error",
      );
    }
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      <PageHeader
        icon={<Printer />}
        title="Impresión"
        subtitle="Etiquetas para identificación de paquetes"
        tone="corporate"
        metadata={
          selectedSite && (
            <span
              className={`${styles.connection} ${selectedSite.agentOnline ? styles.online : ""}`}
            >
              {selectedSite.agentOnline ? <Wifi /> : <WifiOff />}
              {selectedSite.agentOnline
                ? "Impresora conectada"
                : "Impresora sin conexión"}
            </span>
          )
        }
      />
      {selectedSite && (
        <section
          className={styles.operationsBar}
          aria-label="Estado de la estación de impresión"
        >
          <div className={styles.stationIdentity}>
            <span
              className={`${styles.stationIcon} ${selectedSite.agentOnline ? styles.stationOnline : ""}`}
            >
              <Printer />
            </span>
            <div>
              <small>Estación de impresión</small>
              <strong>
                {selectedSite.printers[0] || "Sin impresora asignada"}
              </strong>
            </div>
          </div>
          <div className={styles.operationMetric}>
            <small>Sede operativa</small>
            <strong>{selectedSite.name}</strong>
          </div>
          <div className={styles.operationMetric}>
            <small>Trabajos en curso</small>
            <strong>{queueSummary.active}</strong>
          </div>
          <div className={styles.operationMetric}>
            <small>Estado</small>
            <strong
              className={
                selectedSite.agentOnline
                  ? styles.statusOnline
                  : styles.statusOffline
              }
            >
              <span />
              {selectedSite.agentOnline
                ? "Lista para imprimir"
                : "Sin conexión"}
            </strong>
          </div>
          <button
            className={styles.historyButton}
            type="button"
            title="Ver actividad de impresión"
            aria-label="Ver actividad de impresión"
            onClick={() => setShowHistory(true)}
          >
            <Eye />
            {jobs.length > 0 && <span>{jobs.length}</span>}
          </button>
          {canManage && (
            <button
              className={styles.configureButton}
              type="button"
              onClick={() => void openSetup()}
            >
              <Settings2 />
              <span>Configurar estación</span>
            </button>
          )}
        </section>
      )}
      {showSetup && selectedSite && (
        <section className={styles.setupPanel}>
          <div className={styles.setupTitle}>
            <div>
              <span className={styles.eyebrow}>Configuración</span>
              <h2>Impresora de {selectedSite.name}</h2>
            </div>
            <button type="button" onClick={() => setShowSetup(false)}>
              Cerrar
            </button>
          </div>
          {!agents.length ? (
            <div className={styles.pairingBox}>
              <div>
                <strong>Vincular equipo de impresión</strong>
                <p>
                  Instala MyG Print Connector en la PC conectada por USB e
                  ingresa el código una sola vez.
                </p>
              </div>
              <div className={styles.pairingActions}>
                <button
                  type="button"
                  onClick={() => void printingService.downloadConnector()}
                >
                  <Download /> Descargar instalador
                </button>
                {pairing ? (
                  <code>{pairing.code}</code>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void printingService
                        .createPairing(Number(siteId))
                        .then(setPairing)
                    }
                  >
                    Generar código
                  </button>
                )}
              </div>
            </div>
          ) : (
            agents.map((agent) => (
              <div className={styles.agentRow} key={agent.id}>
                <div>
                  <strong>{agent.computerName || agent.name}</strong>
                  <small>
                    {agent.online
                      ? "Conectado"
                      : `Último contacto ${formatDate(agent.lastSeenAt)}`}
                  </small>
                </div>
                <select
                  value={agent.printerName || ""}
                  onChange={(e) => void savePrinter(agent, e.target.value)}
                >
                  <option value="">Seleccionar impresora USB</option>
                  {agent.printers.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    await printingService.removeAgent(agent.id);
                    setAgents([]);
                    await loadSites();
                  }}
                >
                  Desvincular
                </button>
              </div>
            ))
          )}
        </section>
      )}
      <div className={styles.workspace}>
        <form className={styles.composer} onSubmit={submit}>
          <div className={styles.leftColumn}>
            <aside
              className={styles.workflowNav}
              aria-label="Flujo de preparación"
            >
              <div className={styles.workflowBrand}>
                <span>Nuevo trabajo</span>
                <strong>Preparar impresión</strong>
                <small>Completa el lote antes de enviarlo.</small>
              </div>
              <nav>
                <button
                  type="button"
                  className={
                    activeStep === "SOURCE" ? styles.workflowActive : ""
                  }
                  onClick={() => setActiveStep("SOURCE")}
                >
                  <span className={styles.workflowIndex}>1</span>
                  <span>
                    <strong>Obtener paquetes</strong>
                    <small>Ruta Urbano o registro manual</small>
                  </span>
                  {routeSummary?.imported ? (
                    <CheckCircle2 className={styles.workflowCheck} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={
                    activeStep === "SETUP" ? styles.workflowActive : ""
                  }
                  onClick={() => setActiveStep("SETUP")}
                >
                  <span className={styles.workflowIndex}>2</span>
                  <span>
                    <strong>Configurar lote</strong>
                    <small>Sede, reparto y cantidad</small>
                  </span>
                  {siteId && reference.trim() ? (
                    <CheckCircle2 className={styles.workflowCheck} />
                  ) : null}
                </button>
                <button
                  type="button"
                  className={
                    activeStep === "DESIGN" ? styles.workflowActive : ""
                  }
                  onClick={() => {
                    setActiveStep("DESIGN");
                    setShowDesign(true);
                  }}
                >
                  <span className={styles.workflowIndex}>3</span>
                  <span>
                    <strong>Diseño de etiqueta</strong>
                    <small>Marca, tipografía y contraste</small>
                  </span>
                </button>
              </nav>
              <div className={styles.workflowHelp}>
                <Printer />
                <span>
                  <strong>
                    {selectedSite?.printers[0] || "Sin impresora"}
                  </strong>
                  <small>
                    {selectedSite?.agentOnline
                      ? "Estación disponible"
                      : "Requiere conexión"}
                  </small>
                </span>
              </div>
            </aside>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.titleWithStep}>
                  <span className={styles.stepNumber}>01</span>
                  <div>
                    <span className={styles.eyebrow}>Preparación</span>
                    <h2>Nuevo lote de etiquetas</h2>
                    <p>Importa una ruta o registra paquetes manualmente.</p>
                  </div>
                </div>
                <span className={styles.counter}>
                  {labels.length} {labels.length === 1 ? "paquete" : "paquetes"}
                </span>
              </div>
              <div className={styles.workArea}>
                <aside className={styles.controlRail}>
                  <div className={styles.railHeading}>
                    <span>
                      {activeStep === "SOURCE"
                        ? "Origen de los paquetes"
                        : activeStep === "SETUP"
                          ? "Datos operativos"
                          : "Apariencia de impresión"}
                    </span>
                    <small>
                      {activeStep === "SOURCE"
                        ? "Consulta o registro manual"
                        : activeStep === "SETUP"
                          ? "Destino y cantidad"
                          : "Personalización térmica"}
                    </small>
                  </div>
                  <div
                    className={styles.controlSection}
                    hidden={activeStep !== "SOURCE"}
                  >
                    <div className={styles.sourceTabs}>
                      <button
                        type="button"
                        className={
                          entryMode === "URBANO" ? styles.sourceActive : ""
                        }
                        onClick={() => setEntryMode("URBANO")}
                      >
                        <Truck />
                        Desde ruta Urbano
                      </button>
                      <button
                        type="button"
                        className={
                          entryMode === "MANUAL" ? styles.sourceActive : ""
                        }
                        onClick={() => {
                          setEntryMode("MANUAL");
                          setActiveStep("SETUP");
                        }}
                      >
                        <Plus />
                        Ingreso manual
                      </button>
                    </div>
                    {entryMode === "URBANO" && (
                      <section className={styles.routeImporter}>
                        <div>
                          <span className={styles.eyebrow}>Carga masiva</span>
                          <strong>Consultar ruta</strong>
                          <p>
                            Recupera nombres y teléfonos desde Consulta de
                            rutas.
                          </p>
                        </div>
                        <div className={styles.routeQuery}>
                          <label>
                            Número de ruta
                            <input
                              inputMode="numeric"
                              value={routeId}
                              onChange={(e) =>
                                setRouteId(normalizeRouteId(e.target.value))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void loadRouteForPrinting();
                                }
                              }}
                              placeholder="Ej. 2452950"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void loadRouteForPrinting()}
                            disabled={loadingRoute || !routeId}
                          >
                            {loadingRoute ? (
                              <RefreshCw className={styles.spinning} />
                            ) : (
                              <Search />
                            )}
                            {loadingRoute ? "Consultando..." : "Consultar"}
                          </button>
                        </div>
                        {routeRecords.length > 0 && (
                          <div className={styles.localityFilter}>
                            <label>
                              Distrito o localidad
                              <select
                                value={locality}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setLocality(next);
                                  const count = prepareRouteLabels(
                                    routeRecords,
                                    next,
                                  );
                                  showToast(
                                    `${count} etiquetas seleccionadas.`,
                                    count ? "success" : "warning",
                                  );
                                }}
                              >
                                <option value="">
                                  Todos los destinos ({routeRecords.length})
                                </option>
                                {uniqueLocalities(routeRecords).map((value) => (
                                  <option key={value} value={value}>
                                    {value} (
                                    {
                                      routeRecords.filter(
                                        (record) => record.localidad === value,
                                      ).length
                                    }
                                    )
                                  </option>
                                ))}
                              </select>
                            </label>
                            <small>
                              Este filtro no vuelve a consultar Urbano.
                            </small>
                          </div>
                        )}
                        {routeSummary && (
                          <div className={styles.importResult}>
                            <CheckCircle2 />
                            <span>
                              <strong>
                                {routeSummary.imported} etiquetas listas
                              </strong>
                              {routeSummary.omitted
                                ? ` · ${routeSummary.omitted} registros omitidos por datos incompletos o duplicados`
                                : " · Todos los registros son válidos"}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveStep("SETUP")}
                            >
                              Continuar
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                  <div
                    className={styles.controlSection}
                    hidden={activeStep !== "SETUP"}
                  >
                    <div className={styles.setupGrid}>
                      <label>
                        Sede
                        <select
                          value={siteId}
                          onChange={(e) => setSiteId(e.target.value)}
                          disabled={loading}
                        >
                          <option value="">Seleccionar sede</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Referencia del lote
                        <input
                          value={reference}
                          maxLength={120}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="Ej. Reparto Satipo"
                        />
                      </label>
                      <label>
                        Día de reparto
                        <select
                          value={dispatchDay}
                          onChange={(e) => setDispatchDay(e.target.value)}
                        >
                          {weekDays.map((day) => (
                            <option key={day}>{day}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Copias
                        <select
                          value={copies}
                          onChange={(e) => setCopies(Number(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {selectedSite && (
                      <div
                        className={`${styles.agentNotice} ${selectedSite.agentOnline ? styles.agentReady : ""}`}
                      >
                        {selectedSite.agentOnline ? (
                          <CheckCircle2 />
                        ) : (
                          <AlertTriangle />
                        )}
                        <span>
                          {selectedSite.agentOnline
                            ? `${selectedSite.printers[0] || "Impresora"} lista para imprimir.`
                            : selectedSite.agentConfigured
                              ? "Las etiquetas quedarán en cola hasta que se conecte la impresora."
                              : "Falta configurar la impresora de esta sede."}
                        </span>
                      </div>
                    )}
                  </div>
                  <div
                    className={styles.controlSection}
                    hidden={activeStep !== "DESIGN"}
                  >
                    <div className={styles.designEditor}>
                      <button
                        className={styles.designToggle}
                        type="button"
                        onClick={() => setShowDesign((value) => !value)}
                      >
                        <span>
                          <Settings2 />
                          <strong>Diseño de etiqueta</strong>
                          <small>Tipografía, tamaños y calidad térmica</small>
                        </span>
                        <span>{showDesign ? "Cerrar" : "Personalizar"}</span>
                      </button>
                      {showDesign && (
                        <div className={styles.designControls}>
                          <label>
                            Marca
                            <input
                              value={design.brand}
                              maxLength={12}
                              onChange={(e) =>
                                setDesign({ ...design, brand: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Subtítulo
                            <input
                              value={design.subtitle}
                              maxLength={16}
                              onChange={(e) =>
                                setDesign({
                                  ...design,
                                  subtitle: e.target.value.toUpperCase(),
                                })
                              }
                            />
                          </label>
                          <label>
                            Tipografía
                            <select
                              value={design.font_family}
                              onChange={(e) =>
                                setDesign({
                                  ...design,
                                  font_family: e.target
                                    .value as LabelDesign["font_family"],
                                })
                              }
                            >
                              <option value="ARIAL">Arial · Moderna</option>
                              <option value="VERDANA">Verdana · Legible</option>
                              <option value="GEORGIA">
                                Georgia · Institucional
                              </option>
                            </select>
                          </label>
                          <label>
                            Destinatario{" "}
                            <output>{design.recipient_size}px</output>
                            <input
                              type="range"
                              min="18"
                              max="27"
                              value={design.recipient_size}
                              onChange={(e) =>
                                setDesign({
                                  ...design,
                                  recipient_size: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Teléfono <output>{design.phone_size}px</output>
                            <input
                              type="range"
                              min="34"
                              max="46"
                              value={design.phone_size}
                              onChange={(e) =>
                                setDesign({
                                  ...design,
                                  phone_size: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Día <output>{design.day_size}px</output>
                            <input
                              type="range"
                              min="14"
                              max="22"
                              value={design.day_size}
                              onChange={(e) =>
                                setDesign({
                                  ...design,
                                  day_size: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Intensidad <output>{design.density}/12</output>
                            <input
                              type="range"
                              min="3"
                              max="12"
                              value={design.density}
                              onChange={(e) =>
                                setDesign({
                                  ...design,
                                  density: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label className={styles.checkControl}>
                            <input
                              type="checkbox"
                              checked={design.show_sequence_circle}
                              onChange={(e) =>
                                setDesign({
                                  ...design,
                                  show_sequence_circle: e.target.checked,
                                })
                              }
                            />{" "}
                            Mostrar círculo
                          </label>
                          <button
                            className={styles.resetDesign}
                            type="button"
                            onClick={() => setDesign(defaultDesign)}
                          >
                            <RotateCcw />
                            Restablecer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
                <section className={styles.packageWorkspace}>
                  <div className={styles.packageHeading}>
                    <div>
                      <span className={styles.eyebrow}>Destinatarios</span>
                      <h3>Paquetes del lote</h3>
                    </div>
                    <div className={styles.recordHealth}>
                      <span className={styles.recordValid}>
                        <CheckCircle2 /> {labelSummary.complete} completos
                      </span>
                      {labelSummary.incomplete > 0 && (
                        <span className={styles.recordIncomplete}>
                          <AlertTriangle /> {labelSummary.incomplete} por
                          completar
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.tableHeader} aria-hidden="true">
                    <span>N.º</span>
                    <span>Correlativo</span>
                    <span>Destinatario</span>
                    <span>Teléfono</span>
                    <span>Acciones</span>
                  </div>
                  <div className={styles.orderList}>
                    {labels.map((label, index) => (
                      <article className={styles.orderCard} key={label.id}>
                        <div className={styles.orderNumber}>
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className={styles.orderFields}>
                          <label>
                            Correlativo
                            <input
                              value={label.sequence}
                              maxLength={6}
                              onChange={(e) =>
                                updateLabel(
                                  label.id,
                                  "sequence",
                                  e.target.value,
                                )
                              }
                              placeholder="12"
                            />
                          </label>
                          <label>
                            Destinatario
                            <input
                              value={label.recipient}
                              maxLength={80}
                              onChange={(e) =>
                                updateLabel(
                                  label.id,
                                  "recipient",
                                  e.target.value,
                                )
                              }
                              placeholder="Nombre y apellidos"
                            />
                          </label>
                          <label>
                            Teléfono
                            <input
                              value={label.phone}
                              inputMode="numeric"
                              maxLength={15}
                              onChange={(e) =>
                                updateLabel(label.id, "phone", e.target.value)
                              }
                              placeholder="992130971"
                            />
                          </label>
                        </div>
                        <div className={styles.orderActions}>
                          <button
                            type="button"
                            title="Duplicar"
                            onClick={() =>
                              setLabels((current) => [
                                ...current,
                                {
                                  ...label,
                                  id: crypto.randomUUID(),
                                  sequence: String(current.length + 1),
                                },
                              ])
                            }
                          >
                            <Copy />
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            disabled={labels.length === 1}
                            onClick={() =>
                              setLabels((current) =>
                                current.filter((item) => item.id !== label.id),
                              )
                            }
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
              <div className={styles.formFooter}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={labels.length >= 100}
                  onClick={() =>
                    setLabels((current) => [
                      ...current,
                      newLabel(String(current.length + 1)),
                    ])
                  }
                >
                  <Plus /> Agregar paquete
                </button>
                <div
                  className={styles.submitGroup}
                  aria-label="Resumen del lote"
                >
                  <span>
                    <strong>{labels.length * copies}</strong> etiquetas en total
                  </span>
                  <button
                    className={styles.primaryButton}
                    type="submit"
                    disabled={!canManage || submitting}
                  >
                    {submitting ? (
                      <RefreshCw className={styles.spinning} />
                    ) : (
                      <Send />
                    )}
                    {submitting ? "Enviando..." : "Enviar a impresión"}
                  </button>
                </div>
              </div>
            </section>
          </div>
          <aside className={styles.previewPanel}>
            <div className={styles.validationTitle}>Validación e impresión</div>
            <div className={styles.panelHeader}>
              <div className={styles.titleWithStep}>
                <span className={styles.stepNumber}>02</span>
                <div>
                  <span className={styles.eyebrow}>Comprobación</span>
                  <h2>Vista previa</h2>
                  <p>Etiqueta térmica · 50 × 38 mm</p>
                </div>
              </div>
            </div>
            <div
              className={styles.packagePreview}
              style={{
                fontFamily:
                  design.font_family === "GEORGIA"
                    ? "Georgia, serif"
                    : `${design.font_family}, Arial, sans-serif`,
              }}
            >
              <span
                className={`${styles.previewSequence} ${!design.show_sequence_circle ? styles.noCircle : ""}`}
              >
                {preview?.sequence || "12"}
              </span>
              <div className={styles.previewBrand}>
                <strong>{design.brand || "MyG"}</strong>
                <small>{design.subtitle || "EXPRESS"}</small>
              </div>
              <div
                className={styles.previewRecipient}
                style={{ fontSize: `${design.recipient_size * 0.77}px` }}
              >
                {preview?.recipient || "NOMBRE DEL DESTINATARIO"}
              </div>
              <div
                className={styles.previewPhone}
                style={{ fontSize: `${design.phone_size * 0.67}px` }}
              >
                {formatPhone(preview?.phone || "992130971")}
              </div>
              <span
                className={styles.previewDay}
                style={{ fontSize: `${design.day_size * 0.68}px` }}
              >
                {dispatchDay.toLowerCase()}
              </span>
            </div>
            <div className={styles.previewHint}>
              Vista proporcional · Salida optimizada a 203 dpi
            </div>
            <dl className={styles.summary}>
              <div>
                <dt>Paquetes</dt>
                <dd>{labels.length}</dd>
              </div>
              <div>
                <dt>Etiquetas</dt>
                <dd>{labels.length * copies}</dd>
              </div>
              <div>
                <dt>Copias</dt>
                <dd>{copies}</dd>
              </div>
            </dl>
            <div className={styles.previewStatus}>
              <CheckCircle2 />
              <span>
                <strong>Documento listo</strong>
                <small>Los cambios se reflejan en tiempo real.</small>
              </span>
            </div>
            <section className={styles.readinessCard}>
              <div className={styles.readinessHeader}>
                <div>
                  <span className={styles.eyebrow}>Control previo</span>
                  <strong>{labels.length * copies} etiquetas preparadas</strong>
                </div>
                <span className={styles.totalBadge}>{copies}×</span>
              </div>
              <ul>
                <li className={selectedSite?.agentOnline ? styles.checkOk : ""}>
                  <span /> Estación
                  <strong>
                    {selectedSite?.agentOnline ? "Disponible" : "Revisar"}
                  </strong>
                </li>
                <li
                  className={
                    labelSummary.incomplete === 0 ? styles.checkOk : ""
                  }
                >
                  <span /> Destinatarios
                  <strong>
                    {labelSummary.incomplete === 0
                      ? "Completos"
                      : `${labelSummary.incomplete} pendientes`}
                  </strong>
                </li>
                <li className={reference.trim() ? styles.checkOk : ""}>
                  <span /> Referencia del lote
                  <strong>{reference.trim() ? "Definida" : "Pendiente"}</strong>
                </li>
              </ul>
              <button
                className={styles.sidebarSubmit}
                type="submit"
                disabled={!canManage || submitting}
              >
                {submitting ? (
                  <RefreshCw className={styles.spinning} />
                ) : (
                  <Send />
                )}
                <span>
                  {submitting ? "Enviando..." : "Confirmar e imprimir"}
                </span>
              </button>
              <small className={styles.submitSafety}>
                El trabajo se enviará a{" "}
                {selectedSite?.printers[0] || "la impresora configurada"}.
              </small>
            </section>
          </aside>
        </form>
        {showHistory && (
          <div
            className={styles.historyBackdrop}
            role="presentation"
            onMouseDown={() => setShowHistory(false)}
          >
            <section
              className={`${styles.panel} ${styles.history}`}
              role="dialog"
              aria-modal="true"
              aria-label="Actividad de impresión"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className={styles.panelHeader}>
                <div className={styles.titleWithStep}>
                  <span className={styles.stepNumber}>03</span>
                  <div>
                    <span className={styles.eyebrow}>Seguimiento</span>
                    <h2>Actividad de impresión</h2>
                    <p>Controla los trabajos enviados a esta sede.</p>
                  </div>
                </div>
                <div className={styles.historyTools}>
                  <span>
                    <strong>{queueSummary.completed}</strong> completados
                  </span>
                  {queueSummary.errors > 0 && (
                    <span className={styles.historyError}>
                      <strong>{queueSummary.errors}</strong> por revisar
                    </span>
                  )}
                  <button
                    className={styles.iconButton}
                    type="button"
                    title="Actualizar cola"
                    onClick={() => void loadJobs(siteId)}
                  >
                    <RefreshCw />
                  </button>
                  <button
                    className={styles.iconButton}
                    type="button"
                    title="Cerrar"
                    aria-label="Cerrar actividad"
                    onClick={() => setShowHistory(false)}
                  >
                    <XCircle />
                  </button>
                </div>
              </div>
              {!jobs.length ? (
                <div className={styles.empty}>
                  Aún no hay trabajos para esta sede.
                </div>
              ) : (
                <div className={styles.jobList}>
                  {jobs.map((job) => {
                    const meta = statusMeta[job.status];
                    const Icon = meta.icon;
                    return (
                      <article className={styles.job} key={job.id}>
                        <span
                          className={`${styles.statusIcon} ${styles[meta.tone]}`}
                        >
                          <Icon />
                        </span>
                        <div className={styles.jobMain}>
                          <div>
                            <strong>
                              #{job.id} · {job.reference}
                            </strong>
                            <span
                              className={`${styles.statusPill} ${styles[meta.tone]}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p>
                            {job.packageCount} paquetes ·{" "}
                            {job.labelCount * job.copies} etiquetas ·{" "}
                            {job.requestedBy}
                          </p>
                          {job.error && (
                            <small className={styles.errorText}>
                              {job.error}
                            </small>
                          )}
                        </div>
                        <div className={styles.jobMeta}>
                          <strong>{formatDate(job.createdAt)}</strong>
                          <span>
                            {job.printerName || "Sin impresora asignada"}
                          </span>
                        </div>
                        {canManage && job.status === "PENDIENTE" && (
                          <button
                            className={styles.jobAction}
                            disabled={actingJob === job.id}
                            onClick={() => void runAction(job, "cancel")}
                          >
                            <XCircle />
                            Cancelar
                          </button>
                        )}
                        {canManage && job.status === "ERROR" && (
                          <button
                            className={styles.jobAction}
                            disabled={actingJob === job.id}
                            onClick={() => void runAction(job, "retry")}
                          >
                            <RotateCcw />
                            Reintentar
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
export default Printing;

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../../components/ui/Button/Button";
import { Modal } from "../../../components/ui/Modal/Modal";
import { rrhhService } from "../rrhh.service";
import type { Employee } from "../types";
import styles from "../Rrhh.module.css";

type Props = {
  open: boolean;
  siteId: number | null;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
    new Date(),
  );
}

export function AbsenceRequestModal({
  open,
  siteId,
  employees,
  onClose,
  onSaved,
}: Props) {
  const [kind, setKind] = useState<"PERMISO" | "VACACIONES">("PERMISO");
  const [employeeId, setEmployeeId] = useState(0);
  const [type, setType] = useState("PERSONAL");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setEmployeeId(0);
      setType("PERSONAL");
      setStart("");
      setEnd("");
      setReason("");
      setError(null);
    }
  }, [open]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!employeeId || !start || !end || reason.trim().length < 3) {
      setError("Completa el colaborador, las fechas y el motivo.");
      return;
    }
    const selectedEmployee = employees.find((employee) => employee.id === employeeId);
    const requestSiteId = selectedEmployee?.sedeId ?? siteId;
    if (!requestSiteId) {
      setError("No se pudo determinar la sede del colaborador.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (kind === "PERMISO")
        await rrhhService.createPermission({
          sede_id: requestSiteId,
          employee_id: employeeId,
          type,
          start_at: start,
          end_at: end,
          reason,
        });
      else
        await rrhhService.createVacation({
          sede_id: requestSiteId,
          employee_id: employeeId,
          start_date: start,
          end_date: end,
          reason,
        });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo registrar la solicitud.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva solicitud"
      description="Registra el sustento antes de enviarlo a revisión."
      maxWidth={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="absence-request" loading={saving}>
            Registrar solicitud
          </Button>
        </>
      }
    >
      <form id="absence-request" className={styles.form} onSubmit={submit}>
        {error && (
          <div className={styles.formError} role="alert">
            {error}
          </div>
        )}
        <div className={styles.requestKind}>
          <button
            type="button"
            className={kind === "PERMISO" ? styles.requestKindActive : ""}
            onClick={() => {
              setKind("PERMISO");
              setStart("");
              setEnd("");
            }}
          >
            Permiso / justificación
          </button>
          <button
            type="button"
            className={kind === "VACACIONES" ? styles.requestKindActive : ""}
            onClick={() => {
              setKind("VACACIONES");
              setStart("");
              setEnd("");
            }}
          >
            Vacaciones
          </button>
        </div>
        <div className={styles.formGrid}>
          <label>
            Colaborador
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(Number(event.target.value))}
            >
              <option value={0}>Seleccionar colaborador</option>
              {employees
                .filter((employee) => employee.estado === "ACTIVO")
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.apellidos}, {employee.nombres}
                    {siteId === null && employee.sedeNombre ? ` · ${employee.sedeNombre}` : ""}
                  </option>
                ))}
            </select>
          </label>
          {kind === "PERMISO" && (
            <label>
              Tipo de permiso
              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="PERSONAL">Personal</option>
                <option value="MEDICO">Médico</option>
                <option value="FAMILIAR">Familiar</option>
                <option value="OTRO">Otro</option>
              </select>
            </label>
          )}
          <label>
            Inicio
            <input
              type={kind === "PERMISO" ? "datetime-local" : "date"}
              min={kind === "VACACIONES" ? today() : undefined}
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            Fin
            <input
              type={kind === "PERMISO" ? "datetime-local" : "date"}
              min={kind === "VACACIONES" ? start || today() : undefined}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
        <label className={styles.fullField}>
          Motivo y sustento
          <textarea
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Describe el motivo de la solicitud..."
          />
        </label>
      </form>
    </Modal>
  );
}

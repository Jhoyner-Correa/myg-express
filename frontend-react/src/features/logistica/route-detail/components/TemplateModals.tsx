import { useEffect, useState, type FormEvent } from 'react';
import { FileImage, FileText, Info, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import type { TemplateItem } from '../types';
import styles from './TemplateModals.module.css';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

interface TemplateModalsProps {
  galleryOpen: boolean;
  editorOpen: boolean;
  templates: TemplateItem[];
  selectedId: string;
  editing: TemplateItem | null;
  name: string;
  body: string;
  imageName: string;
  imagePreview: string;
  onCloseGallery: () => void;
  onBack: () => void;
  onNew: () => void;
  onSelect: (template: TemplateItem) => void;
  onEdit: (template: TemplateItem) => void;
  onDelete: (id: number) => void;
  onName: (value: string) => void;
  onBody: (value: string) => void;
  onImage: (file: File, base64: string) => void;
  onRemoveImage: () => void;
  onSave: (event: FormEvent) => void;
}

export function TemplateModals({
  galleryOpen,
  editorOpen,
  templates,
  selectedId,
  editing,
  name,
  body,
  imageName,
  imagePreview,
  onCloseGallery,
  onBack,
  onNew,
  onSelect,
  onEdit,
  onDelete,
  onName,
  onBody,
  onImage,
  onRemoveImage,
  onSave,
}: TemplateModalsProps) {
  const [imageDimensions, setImageDimensions] = useState('');
  const [imageSize, setImageSize] = useState('');
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    if (!imagePreview) {
      setImageDimensions('');
      setImageSize('');
      setImageError('');
    } else if (imageName === 'Imagen actual') {
      setImageSize('—');
    }
  }, [imageName, imagePreview]);

  const handleImage = (selected?: File) => {
    if (!selected) return;

    if (!ACCEPTED_IMAGE_TYPES.has(selected.type)) {
      setImageError('Formato no compatible. Usa una imagen JPG, PNG o WebP.');
      return;
    }

    if (selected.size > MAX_IMAGE_SIZE) {
      setImageError('La imagen supera el tamaño máximo permitido de 5 MB.');
      return;
    }

    setImageError('');
    setImageDimensions('');
    setImageSize(formatFileSize(selected.size));
    const reader = new FileReader();
    reader.onload = () => onImage(selected, String(reader.result ?? ''));
    reader.readAsDataURL(selected);
  };

  return (
    <>
      <Modal
        open={galleryOpen}
        title="Plantillas disponibles"
        description="Elige una para la ruta o administra tus plantillas."
        onClose={onCloseGallery}
        maxWidth={1120}
        className={styles.galleryDialog}
        footer={
          <Button variant="secondary" onClick={onCloseGallery}>
            Cerrar
          </Button>
        }
      >
        <div className={styles.toolbar}>
          <div className={styles.summary}>
            <span className={styles.summaryCount}>{templates.length}</span>
            <span>
              <strong>{templates.length === 1 ? 'plantilla disponible' : 'plantillas disponibles'}</strong>
              <small>Selecciona una tarjeta para usarla en esta ruta.</small>
            </span>
          </div>
          <Button size="sm" icon={<Plus size={15} />} onClick={onNew}>
            Nueva plantilla
          </Button>
        </div>

        <div className={styles.gallery}>
          {templates.length > 0 ? (
            templates.map((template) => {
              const selected = selectedId === String(template.id);

              return (
                <article
                  key={template.id}
                  className={`${styles.card} ${selected ? styles.selected : ''}`}
                >
                  <button
                    className={styles.selectArea}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Usar plantilla ${template.nombre}`}
                    onClick={() => onSelect(template)}
                  >
                    <span className={styles.cardHead}>
                      <span className={styles.documentIcon}>
                        <FileText size={17} aria-hidden="true" />
                      </span>
                      <span className={styles.titleBlock}>
                        <strong className={styles.name}>{template.nombre}</strong>
                        <small>Plantilla de WhatsApp</small>
                      </span>
                      {template.adjunto_url && (
                        <span className={styles.imageBadge}>
                          <FileImage size={13} aria-hidden="true" />
                          Imagen
                        </span>
                      )}
                    </span>

                    <span className={styles.body}>{template.cuerpo}</span>
                  </button>

                  <div className={styles.cardFoot}>
                    <span className={`${styles.badge} ${selected ? styles.inUse : ''}`}>
                      {selected ? 'En uso en esta ruta' : 'Disponible'}
                    </span>
                    <span className={styles.actions}>
                      <button
                        className={styles.iconButton}
                        type="button"
                        aria-label={`Editar ${template.nombre}`}
                        title="Editar plantilla"
                        onClick={() => onEdit(template)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className={`${styles.iconButton} ${styles.danger}`}
                        type="button"
                        aria-label={`Eliminar ${template.nombre}`}
                        title="Eliminar plantilla"
                        onClick={() => onDelete(template.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className={styles.empty}>No hay plantillas disponibles.</div>
          )}
        </div>
      </Modal>

      <Modal
        open={editorOpen}
        title={editing ? 'Editar plantilla' : 'Nueva plantilla'}
        description="Guarda un texto reutilizable para tus envíos por ruta."
        onClose={onBack}
        maxWidth={640}
        className={styles.editorDialog}
        footer={
          <>
            <Button variant="secondary" onClick={onBack}>
              Cancelar
            </Button>
            <Button type="submit" form="template-editor-form">
              {editing ? 'Guardar cambios' : 'Crear plantilla'}
            </Button>
          </>
        }
      >
        <form id="template-editor-form" className={styles.editorForm} onSubmit={onSave}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Nombre de plantilla</span>
            <input
              value={name}
              onChange={(event) => onName(event.target.value)}
              required
              placeholder="Ej. Aviso de llegada"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Mensaje</span>
            <textarea
              value={body}
              onChange={(event) => onBody(event.target.value)}
              required
              placeholder="Hola {nombre}, su paquete {codigo_paquete} llegó."
            />
          </label>

          <div className={styles.variablesHint}>
            <Info size={15} aria-hidden="true" />
            <span>Variables útiles:</span>
            <code>{'{nombre}'}</code>
            <code>{'{codigo_paquete}'}</code>
            <code>{'{telefono}'}</code>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Imagen adjunta (opcional)</span>
            <label className={styles.upload}>
              <Upload size={15} aria-hidden="true" />
              <span>{imagePreview ? 'Cambiar imagen' : 'Subir imagen'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={imagePreview ? 'Cambiar imagen adjunta' : 'Subir imagen adjunta'}
                onChange={(event) => handleImage(event.target.files?.[0])}
              />
            </label>

            {imagePreview && (
              <div className={styles.fileCard}>
                <span className={styles.preview}>
                  <img
                    src={imagePreview}
                    alt="Vista previa del adjunto"
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      setImageDimensions(`${image.naturalWidth} × ${image.naturalHeight} px`);
                    }}
                  />
                </span>
                <span className={styles.fileInfo}>
                  <strong>{imageName && imageName !== 'Imagen actual' ? imageName : 'Imagen adjunta'}</strong>
                  <small>
                    {imageDimensions || 'Dimensiones disponibles al cargar'}
                    <span aria-hidden="true">•</span>
                    {imageSize || '—'}
                  </small>
                </span>
                <button
                  className={styles.removeImage}
                  type="button"
                  aria-label="Quitar imagen adjunta"
                  title="Quitar imagen"
                  onClick={() => {
                    setImageDimensions('');
                    setImageSize('');
                    setImageError('');
                    onRemoveImage();
                  }}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}

            <small className={styles.uploadHint}>JPG, PNG o WebP — máximo 5 MB. Se guarda con la plantilla.</small>
            {imageError && <span className={styles.imageError} role="alert">{imageError}</span>}
          </div>
        </form>
      </Modal>
    </>
  );
}

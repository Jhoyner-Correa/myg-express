import React, { useState } from 'react';
import {
  ExternalLink,
  Eye,
  Image as ImageIcon,
  RotateCw,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { UrbanoGuidePhotosResult, UrbanoPhotoItem } from './types';
import { urbanoPhotosService } from './urbanoPhotos.service';
import styles from './UrbanoGuidePhotos.module.css';

interface PhotoGalleryDrawerProps {
  guide: UrbanoGuidePhotosResult;
  siteId: number;
  isOpen: boolean;
  onClose: () => void;
  onGuideUpdated: (updatedGuide: UrbanoGuidePhotosResult) => void;
}

export const PhotoGalleryDrawer: React.FC<PhotoGalleryDrawerProps> = ({
  guide,
  siteId,
  isOpen,
  onClose,
  onGuideUpdated,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<UrbanoPhotoItem | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<UrbanoPhotoItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Upload states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Array<{ file: File; preview: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Lightbox zoom / rotation states
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!isOpen) return null;

  const manIdDet = guide.man_id_det;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    addFilesToUpload(files);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      );
      addFilesToUpload(files);
    }
  };

  const addFilesToUpload = (files: File[]) => {
    setUploadError(null);
    setUploadSuccess(null);
    const validFiles = files.filter((f) => {
      const valid = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(
        f.type.toLowerCase()
      );
      const underSize = f.size <= 10 * 1024 * 1024;
      return valid && underSize;
    });

    if (validFiles.length < files.length) {
      setUploadError('Algunos archivos fueron descartados (solo JPG/PNG/WEBP hasta 10MB).');
    }

    const newPreviews = validFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    setFilePreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveSelectedFile = (index: number) => {
    const item = filePreviews[index];
    if (item) {
      URL.revokeObjectURL(item.preview);
    }
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    if (!manIdDet) {
      setUploadError('No se puede subir fotos sin man_id_det asignado a la guía.');
      return;
    }
    if (!selectedFiles.length) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    let lastPhotos = guide.fotos;
    let successCount = 0;
    let failedCount = 0;

    for (const file of selectedFiles) {
      try {
        const res = await urbanoPhotosService.subirFoto(siteId, manIdDet, guide.guia, file);
        lastPhotos = res.fotos;
        successCount++;
      } catch (err: any) {
        console.error('Error al subir foto:', err);
        failedCount++;
      }
    }

    filePreviews.forEach((p) => URL.revokeObjectURL(p.preview));
    setSelectedFiles([]);
    setFilePreviews([]);
    setIsUploading(false);

    if (successCount > 0) {
      setUploadSuccess(`Se subieron con éxito ${successCount} fotografía(s) a Urbano.`);
      const updated: UrbanoGuidePhotosResult = {
        ...guide,
        fotos: lastPhotos,
        fotos_count: lastPhotos.length,
        status: lastPhotos.length > 0 ? 'CON_FOTOS' : 'SIN_FOTOS',
      };
      onGuideUpdated(updated);
    }

    if (failedCount > 0) {
      setUploadError(`Hubo error al subir ${failedCount} archivo(s).`);
    }
  };

  const handleDeletePhoto = async () => {
    if (!photoToDelete || !manIdDet) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await urbanoPhotosService.eliminarFoto(
        siteId,
        manIdDet,
        guide.guia,
        photoToDelete.img_id
      );

      const updated: UrbanoGuidePhotosResult = {
        ...guide,
        fotos: res.fotos,
        fotos_count: res.fotos.length,
        status: res.fotos.length > 0 ? 'CON_FOTOS' : 'SIN_FOTOS',
      };
      onGuideUpdated(updated);
      setPhotoToDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Error al eliminar la fotografía de Urbano.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openLightbox = (photo: UrbanoPhotoItem) => {
    setSelectedPhoto(photo);
    setZoomLevel(1);
    setRotation(0);
  };

  const closeLightbox = () => {
    setSelectedPhoto(null);
    setZoomLevel(1);
    setRotation(0);
  };

  return (
    <div className={styles.drawerOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.drawerContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderInfo}>
            <div className={styles.guideBadgeRow}>
              <span className={styles.guideCodeDrawer}>{guide.guia}</span>
              {manIdDet ? (
                <span className={styles.manIdBadge}>man_id_det: {manIdDet}</span>
              ) : (
                <span style={{ color: '#dc2626', fontWeight: 750, fontSize: '10px' }}>
                  Sin man_id_det
                </span>
              )}
              {guide.route_id && (
                <span className={styles.routeBadge}>Ruta: {guide.route_id}</span>
              )}
            </div>
            <div className={styles.guideMetaRow}>
              {guide.destinatario && <span>Destinatario: <strong>{guide.destinatario}</strong></span>}
              {guide.destino && <span>Destino: <strong>{guide.destino}</strong></span>}
              {guide.estado_rastreo && (
                <span>Estado: <strong style={{ color: '#1d5fc7' }}>{guide.estado_rastreo}</strong></span>
              )}
            </div>
          </div>
          <button className={styles.closeDrawerBtn} onClick={onClose} title="Cerrar panel">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.drawerBody}>
          {/* Sección Galería */}
          <div className={styles.gallerySection}>
            <div className={styles.sectionTitleRow}>
              <h4>Fotografías en Urbano ({guide.fotos.length})</h4>
              {manIdDet && (
                <span className={styles.sectionSubtitle}>
                  Identificador consultado: {manIdDet}
                </span>
              )}
            </div>

            {!manIdDet ? (
              <div className={styles.alertWarning}>
                Esta guía no tiene identificador de manifiesto (<code>man_id_det</code>). Asigna una ruta o el identificador para ver y subir fotos.
              </div>
            ) : guide.fotos.length === 0 ? (
              <div className={styles.emptyGallery}>
                <ImageIcon size={28} color="#94a3b8" />
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                  No se encontraron fotografías registradas en Urbano para esta guía.
                </p>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                  Puedes subir fotografías utilizando la zona inferior.
                </span>
              </div>
            ) : (
              <div className={styles.photoGrid}>
                {guide.fotos.map((photo, idx) => (
                  <div key={photo.img_id || idx} className={styles.photoCard}>
                    <div className={styles.photoThumbContainer} onClick={() => openLightbox(photo)}>
                      <img
                        src={photo.img_thumbs || photo.img_path}
                        alt={`Foto ${photo.img_tipo || idx + 1}`}
                        className={styles.photoThumbnail}
                        loading="lazy"
                      />
                      <div className={styles.photoOverlay}>
                        <Eye size={14} /> Ampliar
                      </div>
                    </div>
                    <div className={styles.photoDetails}>
                      <div className={styles.photoMeta}>
                        <span className={styles.photoTypeBadge}>{photo.img_tipo || 'FOTO'}</span>
                        {photo.img_fecha_hora && (
                          <span className={styles.photoDate}>{photo.img_fecha_hora}</span>
                        )}
                      </div>
                      <div className={styles.photoCardActions}>
                        <button
                          type="button"
                          className={styles.btnCardView}
                          onClick={() => openLightbox(photo)}
                          title="Ver en pantalla completa"
                        >
                          <Eye size={11} /> Ver
                        </button>
                        <button
                          type="button"
                          className={styles.btnCardDelete}
                          onClick={() => setPhotoToDelete(photo)}
                          title="Eliminar fotografía"
                        >
                          <Trash2 size={11} /> Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sección Subida de Fotografías */}
          {manIdDet && (
            <div className={styles.uploadSection}>
              <h4>Subir Nuevas Fotografías</h4>
              <p className={styles.uploadDescription}>
                Arrastra imágenes o haz clic para seleccionarlas (JPG, PNG, WEBP - máx 10MB por archivo).
              </p>

              <div
                className={styles.dropZone}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <UploadCloud size={24} color="#3b82f6" />
                <p style={{ margin: 0 }}>Arrastra las imágenes aquí o</p>
                <label className={styles.browseBtn}>
                  Examinar archivos
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Previews de archivos seleccionados */}
              {filePreviews.length > 0 && (
                <div>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#334155' }}>
                    Archivos por subir ({filePreviews.length}):
                  </span>
                  <div className={styles.previewsGrid}>
                    {filePreviews.map((p, i) => (
                      <div key={i} className={styles.previewCard}>
                        <img src={p.preview} alt={p.file.name} className={styles.previewThumb} />
                        <span className={styles.previewName}>{p.file.name}</span>
                        <button
                          type="button"
                          className={styles.btnRemovePreview}
                          onClick={() => handleRemoveSelectedFile(i)}
                          disabled={isUploading}
                          title="Quitar"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className={styles.btnUploadConfirm}
                      onClick={handleUploadAll}
                      disabled={isUploading}
                    >
                      {isUploading
                        ? 'Subiendo a Urbano...'
                        : `Confirmar y Subir ${filePreviews.length} Foto(s)`}
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => {
                        filePreviews.forEach((p) => URL.revokeObjectURL(p.preview));
                        setSelectedFiles([]);
                        setFilePreviews([]);
                      }}
                      disabled={isUploading}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {uploadSuccess && <div className={styles.alertSuccess}>{uploadSuccess}</div>}
              {uploadError && <div className={styles.alertError}>{uploadError}</div>}
            </div>
          )}
        </div>

        {/* Modal de Confirmación de Eliminación */}
        {photoToDelete && (
          <div className={styles.modalOverlay} onClick={() => setPhotoToDelete(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <h3>Confirmar Eliminación</h3>
              <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>
                Estás a punto de eliminar la foto ID <strong>{photoToDelete.img_id}</strong> de la guía <strong>{guide.guia}</strong>.
              </p>
              <div className={styles.alertWarning}>
                ⚠️ Esta acción eliminará permanentemente la fotografía de los servidores de Urbano.
              </div>
              {deleteError && <div className={styles.alertError}>{deleteError}</div>}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={handleDeletePhoto}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Eliminando en Urbano...' : 'Sí, Eliminar Fotografía'}
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setPhotoToDelete(null)}
                  disabled={isDeleting}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Visor Lightbox Pantalla Completa */}
        {selectedPhoto && (
          <div className={styles.lightboxOverlay} onClick={closeLightbox}>
            <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.lightboxTopBar}>
                <div className={styles.lightboxTitle}>
                  <span>Guía: {guide.guia}</span>
                  <span className={styles.photoTypeBadge}>{selectedPhoto.img_tipo || 'FOTO'}</span>
                  {selectedPhoto.img_fecha_hora && <span>· {selectedPhoto.img_fecha_hora}</span>}
                </div>
                <div className={styles.lightboxControls}>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                    title="Alejar"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span style={{ fontSize: '11px', fontWeight: 700 }}>{Math.round(zoomLevel * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                    title="Acercar"
                  >
                    <ZoomIn size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    title="Rotar 90°"
                  >
                    <RotateCw size={13} />
                  </button>
                  <a
                    href={selectedPhoto.img_path}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.btnSecondary}
                    style={{ background: '#2563eb', color: '#ffffff', border: 'none' }}
                    title="Abrir imagen original de Google Cloud"
                  >
                    <ExternalLink size={12} /> Original
                  </a>
                  <button
                    type="button"
                    onClick={closeLightbox}
                    style={{ background: '#dc2626', color: '#ffffff' }}
                    title="Cerrar visor"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.lightboxImageWrapper}>
                <img
                  src={selectedPhoto.img_path}
                  alt={`Foto ${selectedPhoto.img_id}`}
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                    transition: 'transform 0.15s ease',
                  }}
                  className={styles.lightboxFullImage}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

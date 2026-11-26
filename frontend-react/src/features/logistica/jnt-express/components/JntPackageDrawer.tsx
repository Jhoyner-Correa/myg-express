import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  MessageCircle,
  Package,
  User,
  MapPin,
  FileText,
  Layers,
  Scale,
  Tag
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import type { JntPackage } from '../types';
import styles from '../JntExpress.module.css';

interface JntPackageDrawerProps {
  pkg: JntPackage | null;
  relatedPackages: JntPackage[];
  onClose: () => void;
  onSelectPackage: (pkg: JntPackage) => void;
  onCopy: (text: string, label: string) => void;
  buildWhatsAppUrl: (pkg: JntPackage) => string;
}

export const JntPackageDrawer: React.FC<JntPackageDrawerProps> = ({
  pkg,
  relatedPackages,
  onClose,
  onSelectPackage,
  onCopy,
  buildWhatsAppUrl,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!pkg) return null;

  const cleanPhone = pkg.telefono ? pkg.telefono.replace(/\D/g, '') : '';
  const hasPhone = cleanPhone.length >= 9;

  const handleFieldCopy = (value: string, label: string, key: string) => {
    onCopy(value, label);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className={styles.drawerOverlay} onClick={onClose} role="presentation">
      <aside
        className={styles.drawerPanel}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de guía ${pkg.guia}`}
      >
        <header className={styles.drawerHeader}>
          <div className={styles.drawerHeaderTitle}>
            <span className={styles.drawerEyebrow}>Detalle de Guía · J&amp;T Express</span>
            <div className={styles.drawerCodeRow}>
              <h2>{pkg.guia}</h2>
              <button
                type="button"
                className={styles.drawerIconBtn}
                onClick={() => handleFieldCopy(pkg.guia, 'Guía', 'guia')}
                title="Copiar código de guía"
                aria-label="Copiar código de guía"
              >
                {copiedField === 'guia' ? <Check size={14} className={styles.iconSuccess} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <button
            type="button"
            className={styles.drawerCloseBtn}
            onClick={onClose}
            aria-label="Cerrar panel de detalle"
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.drawerBody}>
          {/* Quick Action Banner */}
          <div className={styles.drawerQuickActions}>
            {hasPhone ? (
              <a
                href={buildWhatsAppUrl(pkg)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.drawerWhatsAppBtn}
              >
                <MessageCircle size={15} />
                <span>Enviar aviso por WhatsApp</span>
              </a>
            ) : (
              <div className={styles.drawerNoPhoneNotice}>
                Este registro no cuenta con número de celular válido en el manifiesto.
              </div>
            )}
          </div>

          {/* Section 1: Consignado */}
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>
              <User size={14} />
              <span>Consignado y Contacto</span>
            </h3>
            <div className={styles.drawerCard}>
              <div className={styles.drawerField}>
                <span className={styles.drawerFieldLabel}>Destinatario</span>
                <div className={styles.drawerFieldValueRow}>
                  <strong className={styles.drawerFieldStrong}>{pkg.consignado}</strong>
                  <button
                    type="button"
                    className={styles.drawerMiniBtn}
                    onClick={() => handleFieldCopy(pkg.consignado, 'Nombre', 'name')}
                    title="Copiar nombre"
                  >
                    {copiedField === 'name' ? <Check size={13} className={styles.iconSuccess} /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              <div className={styles.drawerField}>
                <span className={styles.drawerFieldLabel}>Teléfono móvil</span>
                <div className={styles.drawerFieldValueRow}>
                  <span className={styles.drawerFieldText}>
                    {hasPhone ? cleanPhone : 'No especificado'}
                  </span>
                  {hasPhone && (
                    <button
                      type="button"
                      className={styles.drawerMiniBtn}
                      onClick={() => handleFieldCopy(cleanPhone, 'Teléfono', 'phone')}
                      title="Copiar teléfono"
                    >
                      {copiedField === 'phone' ? <Check size={13} className={styles.iconSuccess} /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Ubicación */}
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>
              <MapPin size={14} />
              <span>Destino y Dirección</span>
            </h3>
            <div className={styles.drawerCard}>
              <div className={styles.drawerGridTwo}>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Distrito</span>
                  <span className={styles.drawerFieldStrong}>{pkg.distrito || 'No definido'}</span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Provincia / Dpto.</span>
                  <span className={styles.drawerFieldText}>
                    {[pkg.provincia, pkg.departamento].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
              </div>

              <div className={styles.drawerField}>
                <span className={styles.drawerFieldLabel}>Dirección declarada</span>
                <div className={styles.drawerFieldValueRow}>
                  <span className={styles.drawerFieldText}>{pkg.direccion || 'Sin dirección declarada'}</span>
                  {pkg.direccion && (
                    <button
                      type="button"
                      className={styles.drawerMiniBtn}
                      onClick={() => handleFieldCopy(pkg.direccion, 'Dirección', 'dir')}
                      title="Copiar dirección"
                    >
                      {copiedField === 'dir' ? <Check size={13} className={styles.iconSuccess} /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.drawerGridTwo}>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Código de Ruta J&amp;T</span>
                  <span className={styles.drawerFieldText}>{pkg.codigoRuta || '—'}</span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Código Postal</span>
                  <span className={styles.drawerFieldText}>{pkg.codigoPostal || '—'}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Mercadería */}
          <section className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>
              <Package size={14} />
              <span>Especificaciones del Envío</span>
            </h3>
            <div className={styles.drawerCard}>
              <div className={styles.drawerGridThree}>
                <div className={styles.drawerStatCell}>
                  <Scale size={13} />
                  <span>Peso</span>
                  <strong>{pkg.pesoKg ? `${pkg.pesoKg.toFixed(2)} kg` : '—'}</strong>
                </div>
                <div className={styles.drawerStatCell}>
                  <Tag size={13} />
                  <span>Piezas</span>
                  <strong>{pkg.piezas || 1}</strong>
                </div>
                <div className={styles.drawerStatCell}>
                  <FileText size={13} />
                  <span>Página PDF</span>
                  <strong>Pág. {pkg.pagina}</strong>
                </div>
              </div>
              <div className={styles.drawerField}>
                <span className={styles.drawerFieldLabel}>Contenido declarado</span>
                <span className={styles.drawerFieldText}>{pkg.contenido || 'Sin descripción'}</span>
              </div>
            </div>
          </section>

          {/* Section 4: Otros paquetes del mismo consignado */}
          {relatedPackages.length > 1 && (
            <section className={styles.drawerSection}>
              <h3 className={styles.drawerSectionTitle}>
                <Layers size={14} />
                <span>Otros paquetes de este consignado ({relatedPackages.length})</span>
              </h3>
              <div className={styles.drawerRelatedList}>
                {relatedPackages.map((rel, idx) => {
                  const isCurrent = rel.guia === pkg.guia;
                  return (
                    <button
                      key={`${rel.guia}-${idx}`}
                      type="button"
                      className={`${styles.drawerRelatedItem} ${isCurrent ? styles.drawerRelatedCurrent : ''}`}
                      onClick={() => onSelectPackage(rel)}
                    >
                      <div className={styles.drawerRelatedLeft}>
                        <strong>{rel.guia}</strong>
                        <span>{rel.contenido || 'Sin descripción'}</span>
                      </div>
                      <div className={styles.drawerRelatedRight}>
                        <span>{rel.pesoKg ? `${rel.pesoKg.toFixed(2)} kg` : '—'}</span>
                        <small>Pág. {rel.pagina}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <footer className={styles.drawerFooter}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cerrar detalle
          </Button>
        </footer>
      </aside>
    </div>
  );
};

import React from 'react';

export const Dashboard: React.FC = () => {
  return (
    <div className="main dashboard-main">
      <main className="content">
        <div className="welcome-watermark">
          <img
            className="welcome-watermark__logo"
            src="/img/logo.png"
            alt="MyG Express"
          />
          <h2 className="welcome-watermark__title">
            Conectando la Selva Central
          </h2>
          <p className="welcome-watermark__subtitle">
            Seleccione una opción en el menú lateral para comenzar.
          </p>
        </div>
      </main>
    </div>
  );
};

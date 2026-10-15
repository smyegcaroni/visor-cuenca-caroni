import globeGif from "../Styles/globe.gif";
// Si el logo está en src, impórtalo:
// import logoSvg from "../images/logo_fao.svg"; 
import Styles from "./loader.scss";

export const Loader = () => {
  return (
    <div
      className={Styles.loaderUi}
      style={{
        backgroundColor: "#245C66",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        position: "relative"
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          marginTop: "140px"   // ✅ Desplaza el bloque hacia abajo
        }}
      >
        <img src={globeGif} style={{ maxWidth: "120px", maxHeight: "120px" }} alt="Globe" />
        <span
          style={{
            color: "white",
            marginTop: "-160px",
            fontSize: "1.4rem",
            fontFamily: "'Roboto', sans-serif"
          }}
        >
          Cargando Visor...
        </span>
      </div>

      {/* Logo FAO: elige la opción que corresponda a tu proyecto */}
      {/* Opción 1: importado (descomentar import y usar src={logoSvg}) */}
      {/* <img src={logoSvg} alt="Logo FAO" style={{ marginTop: "20px", width: "280px", height: "auto" }} /> */}
      
      {/* Opción 2: ruta absoluta desde public (si está en public/images/logo_fao.svg) */}
      <img src="/caroni-branding/logo_fao_caroni.png?v=fe76114f2c7d" alt="FAO Cuenca del Río Caroní" width={350} height={40} style={{ marginTop: "20px", width: "350px", height: "40px", objectFit: "contain" }} />
      
      {/* Opción 3: URL externa (si el logo está alojado en ese servidor) */}
      {/* <img src="https://visor-smyeg.gisdata.es/images/logo_fao.svg" alt="Logo FAO" style={{ marginTop: "20px", width: "280px", height: "auto" }} /> */}
    </div>
  );
};
import globeGif from "../Styles/globe.gif";
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
          marginTop: "140px"
        }}
      >
        <img
          src={globeGif}
          style={{ maxWidth: "120px", maxHeight: "120px" }}
          alt="Globe"
        />
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
      <img
        src="/caroni-branding/logo_fao_caroni.webp?v=f07153eaca76"
        alt="Ministerio del Poder Popular para el Ecosocialismo"
        width={520}
        height={90}
        style={{
          marginTop: "20px",
          width: "350px",
          maxWidth: "calc(100vw - 40px)",
          height: "auto",
          objectFit: "contain"
        }}
      />
    </div>
  );
};

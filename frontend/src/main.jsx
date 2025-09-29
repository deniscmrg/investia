import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";


// cria o tema global
const theme = createTheme({
  palette: {
    primary: {
      main: "#c49820ff", // aqui você coloca a cor que quiser
    },
    secondary: {
      main: "#f50057",
    },
  },
  typography: {
    fontFamily: "Roboto, Arial, sans-serif",
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '4px 8px', // altura menor das células
          fontSize: '0.875rem', // fonte um pouco menor
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          height: 32, // altura da linha
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>  
  </React.StrictMode>
);

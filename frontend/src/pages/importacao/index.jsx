import { useState } from "react";
import { Box, Typography, Paper, TextField, Button, Grid, Dialog, DialogTitle, DialogContent, DialogActions, Alert } from "@mui/material";
import api from "../../services/api";

export default function Importacao() {
  const [dataRef, setDataRef] = useState("");
  const [fileAll, setFileAll] = useState(null);
  const [confirma, setConfirma] = useState({ aberto: false, tipo: "", formData: null });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const enviar = async (tipo, arquivo, force=false) => {
    const form = new FormData();
    form.append("tipo", tipo);
    form.append("data_referencia", dataRef);
    form.append("arquivo", arquivo);
    if (force) form.append("force", "true");

    try {
      setLoading(true);
      const res = await api("importacao/upload/", { method: "POST", body: form });
      // Resposta pode ser por tipo único (linhas/status) ou auto (resumo por tipo)
      if (res?.resumo) {
        const p = res.resumo.patrimonio ? `Patrimônio: ${res.resumo.patrimonio.linhas} [${res.resumo.patrimonio.status}]` : null;
        const c = res.resumo.custodia ? `Custódia: ${res.resumo.custodia.linhas} [${res.resumo.custodia.status}]` : null;
        const parts = [p, c].filter(Boolean).join(" | ");
        setMsg({ severity: "success", text: `Importado (auto) — ${parts}` });
      } else {
        setMsg({ severity: "success", text: `Importado ${tipo} (${res.linhas} linhas) [${res.status}]` });
      }
    } catch (err) {
      // Se vier 409, precisamos confirmar
      if (String(err).includes("Erro 409")) {
        setConfirma({ aberto: true, tipo, formData: form });
        return;
      }
      setMsg({ severity: "error", text: `Falha ao importar ${tipo}. ${err}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setMsg(null);
    if (!dataRef) {
      setMsg({ severity: "warning", text: "Informe a data de referência." });
      return;
    }
    if (!fileAll) {
      setMsg({ severity: "warning", text: "Selecione o arquivo (com abas de Patrimônio e Custódia)." });
      return;
    }
    await enviar("auto", fileAll);
  };

  const confirmarSobrescrita = async () => {
    try {
      setLoading(true);
      const form = confirma.formData;
      form.set("force", "true");
      const res = await api("importacao/upload/", { method: "POST", body: form });
      if (res?.resumo) {
        const p = res.resumo.patrimonio ? `Patrimônio: ${res.resumo.patrimonio.linhas} [${res.resumo.patrimonio.status}]` : null;
        const c = res.resumo.custodia ? `Custódia: ${res.resumo.custodia.linhas} [${res.resumo.custodia.status}]` : null;
        const parts = [p, c].filter(Boolean).join(" | ");
        setMsg({ severity: "success", text: `Sobrescrito (auto) — ${parts}` });
      } else {
        setMsg({ severity: "success", text: `Sobrescrito ${confirma.tipo} (${res.linhas} linhas).` });
      }
    } catch (err) {
      setMsg({ severity: "error", text: `Falha ao sobrescrever ${confirma.tipo}. ${err}` });
    } finally {
      setConfirma({ aberto: false, tipo: "", formData: null });
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 12, px: 4 }}>
      <Typography variant="h4" mb={2}>Ferramentas → Importação</Typography>

      {msg && <Alert severity={msg.severity} sx={{ mb: 2 }}>{msg.text}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <TextField
              label="Data de referência"
              type="date"
              fullWidth
              value={dataRef}
              onChange={(e) => setDataRef(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} md={9} />

          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>Arquivo (Patrimônio + Custódia) — XLSX</Typography>
            <Button component="label" variant="outlined" fullWidth disabled={loading}>
              {fileAll ? fileAll.name : "Selecionar arquivo..."}
              <input hidden type="file" accept=".xlsx,.xls" onChange={(e) => setFileAll(e.target.files?.[0] || null)} />
            </Button>
          </Grid>

          <Grid item xs={12}>
            <Button variant="contained" onClick={handleSubmit} disabled={loading}>
              {loading ? "Enviando..." : "OK — Importar"}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Dialog open={confirma.aberto} onClose={() => setConfirma({ aberto: false, tipo: "", formData: null })}>
        <DialogTitle>Dados já existem</DialogTitle>
        <DialogContent>
          {confirma.tipo === 'auto' ? (
            <>Já existem dados para a data informada (Patrimônio e/ou Custódia). Deseja sobrescrever?</>
          ) : (
            <>Já existem dados de <b>{confirma.tipo}</b> para a data informada. Deseja sobrescrever?</>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirma({ aberto: false, tipo: "", formData: null })}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmarSobrescrita}>Sobrescrever</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

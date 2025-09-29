import { useState, useEffect } from "react";
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Button, CircularProgress
} from "@mui/material";
import api from "../../services/api";

export default function Recomendacoes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const fetchRecs = async () => {
    setLoading(true);
    try {
      const res = await api("api/recomendacoes/");
      setRows(res || []);
    } catch (err) {
      console.error("Erro ao buscar recomendações:", err);
    } finally {
      setLoading(false);
    }
  };

  const atualizar = async () => {
    setLoading(true);
    try {
      const res = await api("api/recomendacoes/", { method: "POST" });
      setMsg(res.message);
      await fetchRecs();
    } catch (err) {
      console.error("Erro ao atualizar:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecs();
  }, []);

  return (
    <Box sx={{ mt: 12, px: 4 }}>
      <Typography variant="h4" mb={2}>📊 Recomendações Diárias</Typography>
      <Button variant="contained" onClick={atualizar} sx={{ mb: 2 }}>🔄 Atualizar</Button>
      {msg && <Typography sx={{ mb: 2 }}>{msg}</Typography>}
      {loading ? <CircularProgress /> : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ticker</TableCell>
              <TableCell>Empresa</TableCell>
              <TableCell>Setor</TableCell>
              <TableCell>Data</TableCell>
              <TableCell>Preço compra</TableCell>
              <TableCell>Alvo sugerido</TableCell>
              <TableCell>% Estimado</TableCell>
              <TableCell>Probabilidade</TableCell>
              <TableCell>Vezes alvo 1m</TableCell>
              <TableCell>Cruza médias</TableCell>
              <TableCell>OBV ↑</TableCell>
              <TableCell>Volume ↑</TableCell>
              <TableCell>WMA602</TableCell>
              <TableCell>Origem</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length ? rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.ticker}</TableCell>
                <TableCell>{r.empresa}</TableCell>
                <TableCell>{r.setor}</TableCell>
                <TableCell>{r.data}</TableCell>
                <TableCell>{r.preco_compra}</TableCell>
                <TableCell>{r.alvo_sugerido}</TableCell>
                <TableCell>{r.percentual_estimado}</TableCell>
                <TableCell>{r.probabilidade}</TableCell>
                <TableCell>{r.vezes_atingiu_alvo_1m}</TableCell>
                <TableCell>{r.cruza_medias ? "✅" : "❌"}</TableCell>
                <TableCell>{r.obv_cres ? "✅" : "❌"}</TableCell>
                <TableCell>{r.vol_acima_media ? "✅" : "❌"}</TableCell>
                <TableCell>{r.wma602 ? "✅" : "❌"}</TableCell>
                <TableCell>{r.origem}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={14} align="center">Nenhum registro encontrado.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

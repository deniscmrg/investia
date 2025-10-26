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
        <Box sx={{ '& .MuiTableCell-root': { fontSize: '0.79rem' } }}>
        <Table>
          <TableHead>
            <TableRow>
              {[
                "Ticker",
                "Empresa",
                "Setor",
                "Data",
                "Preço compra",
                "Alvo sugerido",
                "% Estimado",
                "Probabilidade",
                "Vezes alvo 1m",
                "Cruza médias",
                "OBV ↑",
                "Volume ↑",
                "WMA602",
                "MIN",
                "MAX",
                "AMPLITUDE",
                "AMP A×F",
                "AMP MX×MN",
                "A×F",
                "ALVO",
                "ALTA",
                "BAIXA",
              ].map((h, idx) => (
                <TableCell key={idx}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length ? rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.ticker}</TableCell>
                <TableCell>{r.empresa}</TableCell>
                <TableCell>{r.setor}</TableCell>
                <TableCell>{r.data}</TableCell>
                <TableCell>{Number(r.preco_compra)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.alvo_sugerido)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.percentual_estimado)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}%</TableCell>
                <TableCell>{Number(r.probabilidade)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}%</TableCell>
                <TableCell>{r.vezes_atingiu_alvo_1m}</TableCell>
                <TableCell>{r.cruza_medias ? "✅" : "❌"}</TableCell>
                <TableCell>{r.obv_cres ? "✅" : "❌"}</TableCell>
                <TableCell>{r.vol_acima_media ? "✅" : "❌"}</TableCell>
                <TableCell>{Number(r.wma602)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.MIN)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.MAX)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.AMPLITUDE)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.AMP_AxF)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.AMP_MXxMN)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.A_x_F)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.ALVO)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.ALTA)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
                <TableCell>{Number(r.BAIXA)?.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={22} align="center">Nenhum registro encontrado.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </Box>
      )}
    </Box>
  );
}

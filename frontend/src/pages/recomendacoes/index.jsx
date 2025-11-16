import { useState, useEffect } from "react";
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Button, CircularProgress, TableSortLabel
} from "@mui/material";
import api from "../../services/api";

export default function Recomendacoes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [order, setOrder] = useState("asc");
  const [orderBy, setOrderBy] = useState("ticker");

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

  const getSortValue = (row, property) => {
    const value = row?.[property];
    if (value == null || value === "") return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") return value;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
    return String(value).toUpperCase();
  };
  const descendingComparator = (a, b, property) => {
    const av = getSortValue(a, property);
    const bv = getSortValue(b, property);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return bv - av;
    return String(bv).localeCompare(String(av), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  };
  const getComparator = (sortOrder, property) =>
    sortOrder === "desc"
      ? (a, b) => descendingComparator(a, b, property)
      : (a, b) => -descendingComparator(a, b, property);
  const stableSort = (array, comparator) => {
    const stabilized = (array || []).map((el, index) => [el, index]);
    stabilized.sort((a, b) => {
      const cmp = comparator(a[0], b[0]);
      if (cmp !== 0) return cmp;
      return a[1] - b[1];
    });
    return stabilized.map((el) => el[0]);
  };
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const recColumns = [
    { id: "ticker", label: "Ticker", type: "text" },
    { id: "empresa", label: "Empresa", type: "text" },
    { id: "setor", label: "Setor", type: "text" },
    { id: "data", label: "Data", type: "text" },
    { id: "preco_compra", label: "Preço compra", type: "currency" },
    { id: "alvo_sugerido", label: "Alvo sugerido", type: "currency" },
    { id: "percentual_estimado", label: "% Estimado", type: "percent" },
    { id: "probabilidade", label: "Probabilidade", type: "percent" },
    { id: "vezes_atingiu_alvo_1m", label: "Vezes alvo 1m", type: "number" },
    { id: "cruza_medias", label: "Cruza médias", type: "bool" },
    { id: "obv_cres", label: "OBV ↑", type: "bool" },
    { id: "vol_acima_media", label: "Volume ↑", type: "bool" },
    { id: "wma602", label: "WMA602", type: "currency" },
    { id: "MIN", label: "MIN", type: "currency" },
    { id: "MAX", label: "MAX", type: "currency" },
    { id: "AMPLITUDE", label: "AMPLITUDE", type: "currency" },
    { id: "AMP_AxF", label: "AMP A×F", type: "currency" },
    { id: "AMP_MXxMN", label: "AMP MX×MN", type: "currency" },
    { id: "A_x_F", label: "A×F", type: "currency" },
    { id: "ALVO", label: "ALVO", type: "currency" },
    { id: "ALTA", label: "ALTA", type: "currency" },
    { id: "BAIXA", label: "BAIXA", type: "currency" },
  ];
  const formatRecCell = (row, col) => {
    const value = row?.[col.id];
    if (value == null || value === "") return "-";
    switch (col.type) {
      case "currency":
        return Number.isFinite(Number(value))
          ? Number(value).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : value;
      case "percent":
        return Number.isFinite(Number(value))
          ? `${Number(value).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}%`
          : value;
      case "bool":
        return value ? "✅" : "❌";
      case "number":
        return value;
      default:
        return value;
    }
  };
  const sortedRows = stableSort(rows, getComparator(order, orderBy));

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
              {recColumns.map((col) => (
                <TableCell
                  key={col.id}
                  sortDirection={orderBy === col.id ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === col.id}
                    direction={orderBy === col.id ? order : "asc"}
                    onClick={() => handleRequestSort(col.id)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.length ? sortedRows.map((row, i) => (
              <TableRow key={i}>
                {recColumns.map((col) => (
                  <TableCell key={col.id}>{formatRecCell(row, col)}</TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={recColumns.length} align="center">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </Box>
      )}
    </Box>
  );
}

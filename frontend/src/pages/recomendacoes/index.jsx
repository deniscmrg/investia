import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  CircularProgress,
  TableSortLabel,
  TextField,
} from "@mui/material";
import api, { getRecomendacoesIA } from "../../services/api";

export default function Recomendacoes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [order, setOrder] = useState("asc");
  const [orderBy, setOrderBy] = useState("ticker");

  const [iaCompras, setIaCompras] = useState([]);
  const [iaVendas, setIaVendas] = useState([]);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaMinProb, setIaMinProb] = useState(0.4);
  const [iaOrderCompra, setIaOrderCompra] = useState("asc");
  const [iaOrderByCompra, setIaOrderByCompra] = useState("acao_ticker");
  const [iaOrderVenda, setIaOrderVenda] = useState("asc");
  const [iaOrderByVenda, setIaOrderByVenda] = useState("acao_ticker");

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
    fetchRecsIA();
  }, []);

  const fetchRecsIA = async () => {
    setIaLoading(true);
    try {
      const [compras, vendas] = await Promise.all([
        getRecomendacoesIA({ tipo: "compra", minProb: iaMinProb }),
        getRecomendacoesIA({ tipo: "venda", minProb: iaMinProb }),
      ]);
      setIaCompras(compras || []);
      setIaVendas(vendas || []);
    } catch (err) {
      console.error("Erro ao buscar recomendações IA:", err);
    } finally {
      setIaLoading(false);
    }
  };

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
  const getVariacaoColor = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return undefined;
    return num > 0 ? "success.main" : "error.main";
  };
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };
  const handleRequestSortIaCompra = (property) => {
    const isAsc =
      iaOrderByCompra === property && iaOrderCompra === "asc";
    setIaOrderCompra(isAsc ? "desc" : "asc");
    setIaOrderByCompra(property);
  };
  const handleRequestSortIaVenda = (property) => {
    const isAsc = iaOrderByVenda === property && iaOrderVenda === "asc";
    setIaOrderVenda(isAsc ? "desc" : "asc");
    setIaOrderByVenda(property);
  };

  const recColumns = [
    { id: "ticker", label: "Ticker", type: "text" },
    { id: "empresa", label: "Empresa", type: "text" },
    { id: "setor", label: "Setor", type: "text" },
    { id: "data", label: "Data", type: "text" },
    {
      id: "variacao_dia",
      label: "% Hoje (atual/abertura)",
      type: "percent",
    },
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
  const sortedIaCompras = stableSort(
    iaCompras || [],
    getComparator(iaOrderCompra, iaOrderByCompra)
  );
  const sortedIaVendas = stableSort(
    iaVendas || [],
    getComparator(iaOrderVenda, iaOrderByVenda)
  );

  return (
    <Box sx={{ mt: 12, px: 4 }}>
      <Typography variant="h4" mb={2}>
        📊 Recomendações Diárias
      </Typography>
      <Button variant="contained" onClick={atualizar} sx={{ mb: 2 }}>
        🔄 Atualizar
      </Button>
      {msg && <Typography sx={{ mb: 2 }}>{msg}</Typography>}
      {loading ? (
        <CircularProgress />
      ) : (
        <Box sx={{ "& .MuiTableCell-root": { fontSize: "0.79rem" } }}>
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
              {sortedRows.length ? (
                sortedRows.map((row, i) => (
                  <TableRow key={i}>
                    {recColumns.map((col) => {
                      const rawVal = row?.[col.id];
                      const color =
                        col.id === "variacao_dia"
                          ? getVariacaoColor(rawVal)
                          : undefined;
                      return (
                        <TableCell
                          key={col.id}
                          sx={color ? { color } : undefined}
                        >
                          {formatRecCell(row, col)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
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

      {/* Seção de Recomendações IA Direcionais */}
      <Box sx={{ mt: 6 }}>
        <Typography variant="h5" mb={2}>
          🤖 Recomendações IA Direcional (+5% / -5% em 10 pregões)
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <TextField
            label="Prob. mínima"
            type="number"
            size="small"
            value={iaMinProb}
            onChange={(e) => setIaMinProb(Number(e.target.value) || 0)}
            inputProps={{ step: 0.05, min: 0, max: 1 }}
          />
          <Button variant="outlined" onClick={fetchRecsIA}>
            Atualizar IA
          </Button>
        </Box>
        {iaLoading ? (
          <CircularProgress />
        ) : (
          <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 320 }}>
              <Typography variant="subtitle1" mb={1}>
                Compras (UP_FIRST)
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "acao_ticker"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "acao_ticker"}
                        direction={
                          iaOrderByCompra === "acao_ticker"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("acao_ticker")
                        }
                      >
                        Ticker
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "prob_up"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "prob_up"}
                        direction={
                          iaOrderByCompra === "prob_up"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("prob_up")
                        }
                      >
                        Prob. UP
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "preco_entrada"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "preco_entrada"}
                        direction={
                          iaOrderByCompra === "preco_entrada"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("preco_entrada")
                        }
                      >
                        Preço entrada
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "variacao_dia"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "variacao_dia"}
                        direction={
                          iaOrderByCompra === "variacao_dia"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("variacao_dia")
                        }
                      >
                        Var. dia (%)
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "dias_equivalentes_selic"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={
                          iaOrderByCompra === "dias_equivalentes_selic"
                        }
                        direction={
                          iaOrderByCompra === "dias_equivalentes_selic"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra(
                            "dias_equivalentes_selic"
                          )
                        }
                      >
                        Dias SELIC
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "retorno_medio_selic_ativo"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={
                          iaOrderByCompra === "retorno_medio_selic_ativo"
                        }
                        direction={
                          iaOrderByCompra === "retorno_medio_selic_ativo"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra(
                            "retorno_medio_selic_ativo"
                          )
                        }
                      >
                        Ret. médio SELIC ativo
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByCompra === "acao_setor"
                          ? iaOrderCompra
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByCompra === "acao_setor"}
                        direction={
                          iaOrderByCompra === "acao_setor"
                            ? iaOrderCompra
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaCompra("acao_setor")
                        }
                      >
                        Setor
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
              <TableBody>
                {sortedIaCompras && sortedIaCompras.length ? (
                  sortedIaCompras.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell>{rec.acao_ticker}</TableCell>
                      <TableCell>
                          {Number(rec.prob_up || 0).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>
                          {Number(rec.preco_entrada || 0).toLocaleString(
                            "pt-BR",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: getVariacaoColor(rec.variacao_dia),
                          }}
                        >
                          {rec.variacao_dia != null
                            ? `${Number(rec.variacao_dia).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}%`
                            : "-"}
                        </TableCell>
                        <TableCell>{rec.dias_equivalentes_selic ?? "-"}</TableCell>
                        <TableCell>
                          {rec.retorno_medio_selic_ativo != null
                            ? `${Number(
                                rec.retorno_medio_selic_ativo * 100
                              ).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}%`
                            : "-"}
                        </TableCell>
                        <TableCell>{rec.acao_setor || "-"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        Nenhuma recomendação de compra.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            <Box sx={{ flex: 1, minWidth: 320 }}>
              <Typography variant="subtitle1" mb={1}>
                Vendas (DOWN_FIRST)
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell
                      sortDirection={
                        iaOrderByVenda === "acao_ticker"
                          ? iaOrderVenda
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByVenda === "acao_ticker"}
                        direction={
                          iaOrderByVenda === "acao_ticker"
                            ? iaOrderVenda
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaVenda("acao_ticker")
                        }
                      >
                        Ticker
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByVenda === "prob_down"
                          ? iaOrderVenda
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByVenda === "prob_down"}
                        direction={
                          iaOrderByVenda === "prob_down"
                            ? iaOrderVenda
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaVenda("prob_down")
                        }
                      >
                        Prob. DOWN
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByVenda === "preco_entrada"
                          ? iaOrderVenda
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByVenda === "preco_entrada"}
                        direction={
                          iaOrderByVenda === "preco_entrada"
                            ? iaOrderVenda
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaVenda("preco_entrada")
                        }
                      >
                        Preço entrada
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByVenda === "variacao_dia"
                          ? iaOrderVenda
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByVenda === "variacao_dia"}
                        direction={
                          iaOrderByVenda === "variacao_dia"
                            ? iaOrderVenda
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaVenda("variacao_dia")
                        }
                      >
                        Var. dia (%)
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByVenda === "dias_equivalentes_selic"
                          ? iaOrderVenda
                          : false
                      }
                    >
                      <TableSortLabel
                        active={
                          iaOrderByVenda === "dias_equivalentes_selic"
                        }
                        direction={
                          iaOrderByVenda === "dias_equivalentes_selic"
                            ? iaOrderVenda
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaVenda(
                            "dias_equivalentes_selic"
                          )
                        }
                      >
                        Dias SELIC
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByVenda === "retorno_medio_selic_ativo"
                          ? iaOrderVenda
                          : false
                      }
                    >
                      <TableSortLabel
                        active={
                          iaOrderByVenda === "retorno_medio_selic_ativo"
                        }
                        direction={
                          iaOrderByVenda === "retorno_medio_selic_ativo"
                            ? iaOrderVenda
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaVenda(
                            "retorno_medio_selic_ativo"
                          )
                        }
                      >
                        Ret. médio SELIC ativo
                      </TableSortLabel>
                    </TableCell>
                    <TableCell
                      sortDirection={
                        iaOrderByVenda === "acao_setor"
                          ? iaOrderVenda
                          : false
                      }
                    >
                      <TableSortLabel
                        active={iaOrderByVenda === "acao_setor"}
                        direction={
                          iaOrderByVenda === "acao_setor"
                            ? iaOrderVenda
                            : "asc"
                        }
                        onClick={() =>
                          handleRequestSortIaVenda("acao_setor")
                        }
                      >
                        Setor
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedIaVendas && sortedIaVendas.length ? (
                    sortedIaVendas.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell>{rec.acao_ticker}</TableCell>
                        <TableCell>
                          {Number(rec.prob_down || 0).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>
                          {Number(rec.preco_entrada || 0).toLocaleString(
                            "pt-BR",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }
                          )}
                        </TableCell>
                        <TableCell
                          sx={{
                            color: getVariacaoColor(rec.variacao_dia),
                          }}
                        >
                          {rec.variacao_dia != null
                            ? `${Number(rec.variacao_dia).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}%`
                            : "-"}
                        </TableCell>
                        <TableCell>{rec.dias_equivalentes_selic ?? "-"}</TableCell>
                        <TableCell>
                          {rec.retorno_medio_selic_ativo != null
                            ? `${Number(
                                rec.retorno_medio_selic_ativo * 100
                              ).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}%`
                            : "-"}
                        </TableCell>
                        <TableCell>{rec.acao_setor || "-"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        Nenhuma recomendação de venda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

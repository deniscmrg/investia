import {
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  MenuItem,
  Backdrop,
  CircularProgress,
  Stack,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  Chip,
  Snackbar,
  Alert,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { getRecomendacoesIA } from "../../services/api";
import OperacaoModal from "../../components/OperacaoModal";

export default function Carteira() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const [operacoes, setOperacoes] = useState([]);
  const [acoesDisponiveis, setAcoesDisponiveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alerta, setAlerta] = useState({ open: false, severity: "info", text: "" });

  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [operationEditing, setOperationEditing] = useState(null);
  const [tabIndex, setTabIndex] = useState(0);

  const [resumo, setResumo] = useState(null);
  const [updatingQuotes, setUpdatingQuotes] = useState(false);
  const [order, setOrder] = useState("asc");
  const [orderBy, setOrderBy] = useState("acao_nome");

  // ---------- MT5 Nova Compra (modais) ----------
  const [openRecModal, setOpenRecModal] = useState(false);
  const [openNovaCompraModal, setOpenNovaCompraModal] = useState(false);
  const [recsDisponiveis, setRecsDisponiveis] = useState([]);
  const [recSelecionada, setRecSelecionada] = useState(null);
  const [cotacaoAtual, setCotacaoAtual] = useState(null);
  const [alvoSugerido5, setAlvoSugerido5] = useState(null);
  const [cotacaoAtualLoading, setCotacaoAtualLoading] = useState(false);

  const [execucao, setExecucao] = useState("mercado"); // mercado | limite
  const [modoEntrada, setModoEntrada] = useState("quantidade"); // quantidade | valor
  const [precoLimite, setPrecoLimite] = useState("");
  const [tpAlvo, setTpAlvo] = useState("");
  const [qtdDesejada, setQtdDesejada] = useState("");
  const [valorDesejado, setValorDesejado] = useState("");
  const [legsSugeridas, setLegsSugeridas] = useState([]);
  const [validacoesLegs, setValidacoesLegs] = useState([]);
  const [comprando, setComprando] = useState(false);
  const [groupId, setGroupId] = useState(null);
  const [compraStatus, setCompraStatus] = useState(null);
  const compraIntervalRef = useRef(null);
  const mostrarAlerta = (text, severity = "info") => {
    if (!text) return;
    setAlerta({ open: true, severity, text });
  };
  const fecharAlerta = (_event, reason) => {
    if (reason === "clickaway") return;
    setAlerta((prev) => ({ ...prev, open: false }));
  };

  // ---------- MT5 Venda (modal) ----------
  const [openVendaModal, setOpenVendaModal] = useState(false);
  const [opParaVenda, setOpParaVenda] = useState(null);
  const [execucaoVenda, setExecucaoVenda] = useState("mercado");
  const [precoLimiteVenda, setPrecoLimiteVenda] = useState("");
  const [vendendo, setVendendo] = useState(false);
  const [vendaGroupId, setVendaGroupId] = useState(null);
  const [vendaStatus, setVendaStatus] = useState(null);
  const vendaIntervalRef = useRef(null);

  const opsRef = useRef([]);
  useEffect(() => { opsRef.current = operacoes; }, [operacoes]);

  // ---------- utils ----------
  const formatCurrency = (value) => {
    if (value == null || isNaN(Number(value))) return "-";
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  };
  const toNumberOrNull = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const calcDiasPosicionado = (op) => {
    if (op?.dias_posicionado != null) return op.dias_posicionado;
    if (!op?.data_compra) return null;
    const hoje = new Date();
    const dc = new Date(op.data_compra);
    const diff = Math.floor((hoje.setHours(0,0,0,0) - dc.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : null;
  };
  const calcTotalCompra = (op) => {
    if (op?.valor_total_compra != null) return Number(op.valor_total_compra);
    if (op?.preco_unitario != null && op?.quantidade != null) {
      return Number(op.preco_unitario) * Number(op.quantidade);
    }
    return null;
  };
  const calcTotalVenda = (op) => {
    if (op?.valor_total_venda != null) return Number(op.valor_total_venda);
    if (op?.preco_venda_unitario != null && op?.quantidade != null) {
      return Number(op.preco_venda_unitario) * Number(op.quantidade);
    }
    return null;
  };
  const calcVariacaoPercentual = (op) => {
    if (op?.preco_atual != null && op?.preco_unitario != null && Number(op.preco_unitario) !== 0) {
      return ((Number(op.preco_atual) - Number(op.preco_unitario)) / Number(op.preco_unitario)) * 100;
    }
    return null;
  };
  const calcToGainPercentual = (op) => {
    if (op?.preco_atual != null && op?.valor_alvo != null && Number(op.preco_atual) !== 0) {
      return ((Number(op.valor_alvo) - Number(op.preco_atual)) / Number(op.preco_atual)) * 100;
    }
    return null;
  };
  const calcPctResultado = (op) => {
    const totalCompra = calcTotalCompra(op);
    const totalVenda = calcTotalVenda(op);
    if (totalCompra != null && totalVenda != null && totalCompra !== 0) {
      return ((totalVenda - totalCompra) / totalCompra) * 100;
    }
    return null;
  };
  const calcValorResultado = (op) => {
    const totalCompra = calcTotalCompra(op);
    const totalVenda = calcTotalVenda(op);
    if (totalCompra != null && totalVenda != null) {
      return totalVenda - totalCompra;
    }
    return null;
  };

  const getCotacaoReferencia = () => {
    const candidatos = [
      cotacaoAtual,
      recSelecionada?.cotacao_atual,
      recSelecionada?.preco_compra,
      execucao === "limite" && precoLimite !== "" ? Number(precoLimite) : null,
    ];
    for (const val of candidatos) {
      const num = Number(val);
      if (!Number.isNaN(num)) return num;
    }
    return null;
  };

  const getSortValue = (op, property) => {
    switch (property) {
      case "acao_nome":
        return op?.acao_nome ? String(op.acao_nome).toUpperCase() : "";
      case "data_compra":
        return op?.data_compra ? new Date(op.data_compra).getTime() : null;
      case "preco_unitario":
        return op?.preco_unitario != null ? Number(op.preco_unitario) : null;
      case "quantidade":
        return op?.quantidade != null ? Number(op.quantidade) : null;
      case "valor_total_compra":
        return calcTotalCompra(op);
      case "valor_alvo":
        return op?.valor_alvo != null ? Number(op.valor_alvo) : null;
      case "dias":
        return calcDiasPosicionado(op);
      case "preco_atual":
        return op?.preco_atual != null ? Number(op.preco_atual) : null;
      case "variacao":
        return calcVariacaoPercentual(op);
      case "to_gain":
        return calcToGainPercentual(op);
      case "status":
        return op?.status ? String(op.status).toUpperCase() : "";
      case "data_venda":
        return op?.data_venda ? new Date(op.data_venda).getTime() : null;
      case "preco_venda_unitario":
        return op?.preco_venda_unitario != null ? Number(op.preco_venda_unitario) : null;
      case "valor_total_venda":
        return calcTotalVenda(op);
      case "pct_resultado":
        return calcPctResultado(op);
      case "valor_resultado":
        return calcValorResultado(op);
      default:
        return op?.[property] ?? null;
    }
  };
  const descendingComparator = (a, b, property) => {
    const av = getSortValue(a, property);
    const bv = getSortValue(b, property);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return bv - av;
    return String(bv).localeCompare(String(av), undefined, { sensitivity: "base", numeric: true });
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

  // ---------- data loaders ----------
  const fetchCotacoes = async (opsParam) => {
    const ops = opsParam ?? opsRef.current;
    if (!ops || !ops.length) return;

    const tickers = ops.filter(op => !op.data_venda).map(op => `${op.acao_nome}.SA`);
    if (!tickers.length) return;

    try {
      const res = await api("cotacoes-atuais/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });

      const atualizado = ops.map(op => {
        if (!op.data_venda) {
          const cot = res[`${op.acao_nome}.SA`];
          return { ...op, preco_atual: cot?.preco_atual ?? null };
        }
        return op;
      });

      setOperacoes(atualizado);
      // Não mexe no resumo aqui. Patrimônio/posicionadas vêm do backend.
    } catch (err) {
      console.error("Erro ao buscar cotações:", err);
    }
  };

  const fetchResumo = async () => {
    try {
      const res = await api(`clientes/${id}/resumo/`);
      if (res && typeof res === "object" && Object.keys(res).length > 0) {
        setResumo(res);
      } else {
        console.error("Resumo vazio do backend");
        setResumo(null);
      }
    } catch (err) {
      console.error("Erro ao buscar resumo:", err);
      setResumo(null);
    }
  };

  const carregarOperacoes = async () => {
    const opsRes = await api(`operacoes/?cliente=${id}`);
    const lista = opsRes.results || opsRes || [];
    setOperacoes(lista);
    return lista;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const clienteRes = await api(`clientes/${id}/`);
        setCliente(clienteRes);

        await carregarOperacoes();

        // 1) resumo do backend (fonte da verdade)
        await fetchResumo();

        // 2) ações disponíveis
        const acoesRes = await api("acoes/");
        setAcoesDisponiveis(acoesRes);

      } catch (err) {
        console.error("Erro ao buscar dados:", err);
        setResumo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const openOperacaoModal = (op = null) => {
    setOperationEditing(op);
    setOperationModalOpen(true);
  };

  const closeOperacaoModal = () => {
    setOperationModalOpen(false);
  };

  const handleDelete = async (opId) => {
    if (confirm("Deseja realmente deletar essa operação?")) {
      try {
        await api(`operacoes/${opId}/`, { method: "DELETE" });
        const nova = operacoes.filter(op => op.id !== opId);
        setOperacoes(nova);

        // Atualiza resumo (backend) e, se quiser, cotações
        await fetchResumo();
        // await fetchCotacoes(nova);
      } catch (err) {
        console.error("Erro ao deletar operação:", err);
      }
    }
  };

  // ---------- Venda ----------
  const abrirVenda = (op) => {
    setOpParaVenda(op);
    setExecucaoVenda("mercado");
    setPrecoLimiteVenda("");
    setVendaStatus(null);
    setVendaGroupId(null);
    setOpenVendaModal(true);
  };

  const confirmarVenda = async () => {
    if (!opParaVenda) return;
    setVendendo(true);
    try {
      const body = { execucao: execucaoVenda };
      if (execucaoVenda === "limite") body.preco = Number(precoLimiteVenda);
      const res = await api(`clientes/${id}/mt5/venda/${opParaVenda.id}/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res?.group_id) {
        setVendaGroupId(res.group_id);
        if (vendaIntervalRef.current) clearInterval(vendaIntervalRef.current);
        vendaIntervalRef.current = setInterval(async () => {
          try {
            const st = await api(`clientes/${id}/mt5/venda-status/${res.group_id}/`);
            setVendaStatus(st);
            if (st?.executed_all) {
              clearInterval(vendaIntervalRef.current);
              vendaIntervalRef.current = null;
              const opsRes = await api(`operacoes/?cliente=${id}`);
              const lista = opsRes.results || opsRes || [];
              setOperacoes(lista);
              await fetchResumo();
              setVendendo(false);
              setOpenVendaModal(false);
            }
          } catch (e) {
            console.error("Erro no polling de venda:", e);
          }
        }, 3000);
      } else {
        setVendendo(false);
      }
    } catch (e) {
      console.error("Erro no envio de venda:", e);
      setVendendo(false);
    }
  };

  const handleManualRefresh = async (opsArg) => {
    try {
      setUpdatingQuotes(true);
      // 1) Garantir resumo do backend
      await fetchResumo();
      // 2) Atualizar cotações das posicionadas (opcional)
      const base = opsArg ?? opsRef.current;
      await fetchCotacoes(base);
    } finally {
      setUpdatingQuotes(false);
    }
  };

  // ---------- MT5: Recs e Nova Compra ----------
  const abrirNovaCompra = async () => {
    try {
      setOpenRecModal(true);
      const [recsClassicasRes, recsIaRes] = await Promise.allSettled([
        api(`clientes/${id}/recomendacoes-disponiveis/`),
        getRecomendacoesIA({ tipo: "todos" }),
      ]);
      const recsClassicas = recsClassicasRes.status === "fulfilled" ? recsClassicasRes.value : [];
      const recsIa = recsIaRes.status === "fulfilled" ? recsIaRes.value : [];
      if (recsClassicasRes.status === "rejected") {
        console.error("Erro ao carregar recomendações clássicas:", recsClassicasRes.reason);
      }
      if (recsIaRes.status === "rejected") {
        console.error("Erro ao carregar recomendações IA:", recsIaRes.reason);
      }

      const tickersEmAberto = new Set(
        operacoes
          .filter(op => !op.data_venda)
          .map(op => (op.acao_nome || "").trim().toUpperCase())
          .filter(Boolean)
      );

      const normalizarClassica = (r) => {
        const ticker = (r?.ticker || "").trim().toUpperCase();
        if (!ticker) return null;
        const cotacao = toNumberOrNull(r?.cotacao_atual);
        const precoCompra = cotacao != null ? cotacao : toNumberOrNull(r?.preco_compra);
        const alvo5 = toNumberOrNull(r?.alvo_sugerido_5pct) ?? (precoCompra != null ? precoCompra * 1.05 : null);
        const prob = toNumberOrNull(r?.probabilidade);
        return {
          ...r,
          ticker,
          empresa: r?.empresa,
          cotacao_atual: cotacao,
          preco_compra: precoCompra,
          alvo_sugerido: toNumberOrNull(r?.alvo_sugerido),
          alvo_sugerido_5pct: alvo5,
          probabilidade: prob != null ? (prob > 1 ? prob : prob * 100) : null,
          origem: "classica",
          lado: "compra",
          key: `classica-${r?.acao_id ?? ticker}`,
        };
      };

      const normalizarIa = (r) => {
        const ticker = (r?.acao_ticker || r?.ticker || "").trim().toUpperCase();
        if (!ticker) return null;
        const lado = (r?.classe || "").toUpperCase() === "DOWN_FIRST" ? "venda" : "compra";
        const probRaw = lado === "venda" ? toNumberOrNull(r?.prob_down) : toNumberOrNull(r?.prob_up);
        const prob = probRaw != null ? (probRaw > 1 ? probRaw : probRaw * 100) : null;
        const precoEntrada = toNumberOrNull(r?.preco_entrada);
        const alvoPct = toNumberOrNull(r?.alvo_percentual);
        const alvoCalculado = precoEntrada != null && alvoPct != null
          ? precoEntrada * (1 + (lado === "venda" ? -1 : 1) * (alvoPct / 100))
          : null;
        const alvo5 = alvoCalculado != null
          ? alvoCalculado
          : (precoEntrada != null ? precoEntrada * (lado === "venda" ? 0.95 : 1.05) : null);
        return {
          acao_id: r?.acao,
          ticker,
          empresa: r?.acao_empresa,
          cotacao_atual: precoEntrada,
          preco_compra: precoEntrada,
          alvo_sugerido: alvoCalculado,
          alvo_sugerido_5pct: alvo5,
          probabilidade: prob,
          origem: "ia",
          lado,
          key: `ia-${r?.id ?? ticker}-${lado}`,
        };
      };

      const listaClassica = Array.isArray(recsClassicas) ? recsClassicas.map(normalizarClassica).filter(Boolean) : [];
      const listaIa = Array.isArray(recsIa) ? recsIa.map(normalizarIa).filter(Boolean) : [];

      const mergedMap = new Map();
      [...listaClassica, ...listaIa].forEach((rec) => {
        const ticker = (rec.ticker || "").toUpperCase();
        if (!ticker || tickersEmAberto.has(ticker)) return;
        const key = `${ticker}|${rec.lado || "?"}`;
        const existente = mergedMap.get(key);
        if (existente) {
          mergedMap.set(key, { ...rec, ...existente, key });
        } else {
          mergedMap.set(key, { ...rec, key });
        }
      });

      const ordenada = Array.from(mergedMap.values()).sort((a, b) => {
        const at = (a?.ticker || "").toUpperCase();
        const bt = (b?.ticker || "").toUpperCase();
        const cmpTicker = at.localeCompare(bt, undefined, { sensitivity: "base" });
        if (cmpTicker !== 0) return cmpTicker;
        const al = (a?.lado || "").toUpperCase();
        const bl = (b?.lado || "").toUpperCase();
        return al.localeCompare(bl, undefined, { sensitivity: "base" });
      });
      setRecsDisponiveis(ordenada);
    } catch (e) {
      console.error("Erro ao carregar recomendações:", e);
      setRecsDisponiveis([]);
    }
  };

  const confirmarRecomendacao = (item) => {
    setRecSelecionada(item);
    setOpenRecModal(false);
    const cot = item?.cotacao_atual != null ? Number(item.cotacao_atual) : (item?.preco_compra != null ? Number(item.preco_compra) : null);
    const alvoSug = item?.alvo_sugerido_5pct != null
      ? Number(item.alvo_sugerido_5pct)
      : (cot != null
        ? cot * 1.05
        : (item?.alvo_sugerido != null ? Number(item.alvo_sugerido) : null));
    setCotacaoAtual(cot);
    setAlvoSugerido5(alvoSug);
    setCotacaoAtualLoading(false);
    // reset form
    setExecucao("mercado");
    setModoEntrada("quantidade");
    setPrecoLimite("");
    setTpAlvo(alvoSug != null ? alvoSug.toFixed(2) : "");
    setQtdDesejada("");
    setValorDesejado("");
    setLegsSugeridas([]);
    setValidacoesLegs([]);
    setOpenNovaCompraModal(true);
  };

  const atualizarCotacaoAtual = async () => {
    if (!recSelecionada?.ticker) return;
    setCotacaoAtualLoading(true);
    try {
      const resp = await api(`clientes/${id}/mt5/cotacao/${recSelecionada.ticker}/`);
      const novoValor = resp?.cotacao != null ? Number(resp.cotacao) : null;
      const novoAlvo = novoValor != null ? novoValor * 1.05 : null;

      if (novoValor == null) {
        mostrarAlerta("Não foi possível obter a cotação atual.", "warning");
      }

      const alvoAnteriorFormatado = alvoSugerido5 != null ? alvoSugerido5.toFixed(2) : "";

      setCotacaoAtual(novoValor);
      setAlvoSugerido5(novoAlvo);
      setRecSelecionada((prev) => prev ? { ...prev, cotacao_atual: novoValor, alvo_sugerido_5pct: novoAlvo } : prev);

      if (novoAlvo != null) {
        if (tpAlvo === "" || tpAlvo === alvoAnteriorFormatado) {
          setTpAlvo(novoAlvo.toFixed(2));
        }
      }
    } catch (e) {
      console.error("Erro ao atualizar cotação:", e);
      mostrarAlerta("Erro ao atualizar cotação pelo MT5.", "error");
    } finally {
      setCotacaoAtualLoading(false);
    }
  };

  const validarDistribuicao = async () => {
    if (!recSelecionada) return;
    const body = {
      ticker: recSelecionada.ticker,
      modo: modoEntrada,
      execucao,
      tp: tpAlvo !== "" ? Number(tpAlvo) : null,
    };
    if (execucao === "limite") body.preco = precoLimite !== "" ? Number(precoLimite) : null;
    if (modoEntrada === "quantidade") body.quantidade = qtdDesejada !== "" ? Number(qtdDesejada) : null;
    if (modoEntrada === "valor") body.valor = valorDesejado !== "" ? Number(valorDesejado) : null;

    try {
      const res = await api(`clientes/${id}/mt5/compra/validar/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLegsSugeridas(res?.legs_sugeridas || []);
      setValidacoesLegs(res?.validacoes || []);
    } catch (e) {
      console.error("Erro na validação:", e);
      if (e?.status === 409) {
        mostrarAlerta(e.message || "Cliente já possui posição aberta para esse papel.", "warning");
      } else {
        mostrarAlerta("Erro ao validar a compra no MT5.", "error");
      }
      setLegsSugeridas([]);
      setValidacoesLegs([]);
    }
  };

  const enviarCompra = async () => {
    if (!recSelecionada || !Array.isArray(legsSugeridas) || legsSugeridas.length === 0) return;
    if (valorMaxCompra != null && valorEstimadoTotal != null && valorEstimadoTotal > valorMaxCompra) {
      mostrarAlerta("Valor estimado da compra excede o VALOR MÁX permitido para o cliente.", "warning");
      return;
    }
    setComprando(true);
    try {
      const body = {
        ticker_base: recSelecionada.ticker,
        execucao,
        tp: Number(tpAlvo),
        legs: legsSugeridas.map((l) => ({ symbol: l.symbol, quantidade: Number(l.quantidade) })),
      };
      if (execucao === "limite") body.preco = Number(precoLimite);
      const res = await api(`clientes/${id}/mt5/compra/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res?.group_id) {
        setGroupId(res.group_id);
        // iniciar polling
        if (compraIntervalRef.current) clearInterval(compraIntervalRef.current);
        compraIntervalRef.current = setInterval(async () => {
          try {
            const st = await api(`clientes/${id}/mt5/compra-status/${res.group_id}/`);
            setCompraStatus(st);
            if (st?.executed_all) {
              clearInterval(compraIntervalRef.current);
              compraIntervalRef.current = null;
              // refresh carteira e resumo
              const opsRes = await api(`operacoes/?cliente=${id}`);
              const lista = opsRes.results || opsRes || [];
              setOperacoes(lista);
              await fetchResumo();
              setComprando(false);
              setOpenNovaCompraModal(false);
            }
          } catch (e) {
            console.error("Erro no polling de compra:", e);
          }
        }, 3000);
      } else {
        setComprando(false);
      }
    } catch (e) {
      console.error("Erro no envio de compra:", e);
      if (e?.status === 409) {
        mostrarAlerta(e.message || "Cliente já possui posição ou ordem pendente para esse papel.", "warning");
      } else {
        mostrarAlerta("Não foi possível enviar a compra. Tente novamente.", "error");
      }
      setComprando(false);
    }
  };

  // ---------- filtragem por aba ----------
  const operacoesDoCliente = operacoes.filter(op => Number(op.cliente) === Number(id));
  let operacoesFiltradas = [];
  if (tabIndex === 1) {
    operacoesFiltradas = operacoesDoCliente.filter(op => !op.data_venda); // POSICIONADAS
  } else if (tabIndex === 2) {
    operacoesFiltradas = operacoesDoCliente.filter(op => op.data_venda);  // REALIZADAS
  }
  const sortedOperacoes = stableSort(operacoesFiltradas, getComparator(order, orderBy));

  const percentualLiberado = cliente?.percentual_patrimonio != null ? Number(cliente.percentual_patrimonio) : null;
  const patrimonioCliente = resumo?.patrimonio != null ? Number(resumo.patrimonio) : null;
  const valorDisponivelAplicacao = resumo?.valor_disponivel != null
    ? Number(resumo.valor_disponivel)
    : (patrimonioCliente != null && percentualLiberado != null
      ? patrimonioCliente * (percentualLiberado / 100)
      : null);
  const baseValorMaximo = patrimonioCliente != null && percentualLiberado != null
    ? patrimonioCliente * (percentualLiberado / 100)
    : valorDisponivelAplicacao;
  const valorMaxCompra = baseValorMaximo != null
    ? (baseValorMaximo / 10) * 1.05
    : null;

  const precoEstimativa = getCotacaoReferencia();
  const valorEstimadoLegs = (legsSugeridas || []).map((l) => {
    const qtd = Number(l?.quantidade);
    const valor = !Number.isNaN(qtd) && precoEstimativa != null ? qtd * precoEstimativa : null;
    return { symbol: l?.symbol, valorEstimado: valor };
  });
  const possuiEstimativas = valorEstimadoLegs.some((l) => l.valorEstimado != null);
  const valorEstimadoTotal = possuiEstimativas
    ? valorEstimadoLegs.reduce((acc, l) => acc + (l.valorEstimado || 0), 0)
    : null;
  const excedeValorMaximo = valorMaxCompra != null && valorEstimadoTotal != null && valorEstimadoTotal > valorMaxCompra;

  return (
    <Box sx={{ mt: 12, px: 4 }}>
      <Button onClick={() => navigate("/clientes/")} sx={{ mb: 2 }}>
        ← Voltar para Clientes
      </Button>

      <Typography variant="h4" mb={2}>{cliente?.nome} - Carteira</Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="contained" onClick={() => abrirNovaCompra()}>
          Nova Compra (MT5)
        </Button>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => openOperacaoModal()}>
          Nova Operação (manual)
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => handleManualRefresh()}
          disabled={updatingQuotes}
        >
          {updatingQuotes ? "Atualizando..." : "Atualizar cotações"}
        </Button>
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)}>
          <Tab label="Resumo" />
          <Tab label="POSICIONADAS" />
          <Tab label="REALIZADAS" />
        </Tabs>
      </Box>

      {/* Aba Resumo */}
      {tabIndex === 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 3, mt: 2 }}>
          <Box sx={{ p: 3, borderRadius: 2, bgcolor: "#f5f5f5", boxShadow: 1 }}>
            <Typography variant="h6">Patrimônio</Typography>
            <Typography variant="h4" sx={{ fontWeight: "bold" }}>
              R$ {formatCurrency(resumo?.patrimonio)}
            </Typography>
            <Typography sx={{ mt: 1 }}>
              % Patrimônio para RV: {resumo?.percentual_patrimonio ?? "-"}%
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Total em ações posicionadas: <strong>R$ {formatCurrency(resumo?.posicionadas)}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Valor disponível: <strong>R$ {formatCurrency(resumo?.valor_disponivel)}</strong>
            </Typography>
          </Box>

          <Box sx={{ p: 3, borderRadius: 2, bgcolor: "#f5f5f5", boxShadow: 1 }}>
            <Typography variant="h6">Posição Consolidada</Typography>
            <Typography sx={{ mt: 1 }}>
              Rent. realizadas: <strong>R$ {formatCurrency(resumo?.realizadas)}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Rent. pocionadas: <strong>R$ {formatCurrency(resumo?.posicionado)}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Resultado Atual: <strong>R$ {formatCurrency(resumo?.posicionado-(resumo?.realizadas*-1))}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Dias desde a primeira compra: <strong>{resumo?.dias_total ?? "-"}</strong>
            </Typography>
            <Typography sx={{ mt: 1 }}>
              Rentabilidade média mensal: <strong>{resumo?.rentabilidade_mensal ?? "-"}%</strong>
            </Typography>
          </Box>
        </Box>
      )}

      {/* Aba POSICIONADAS e REALIZADAS */}
      {tabIndex > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sortDirection={orderBy === "acao_nome" ? order : false}>
                <TableSortLabel
                  active={orderBy === "acao_nome"}
                  direction={orderBy === "acao_nome" ? order : "asc"}
                  onClick={() => handleRequestSort("acao_nome")}
                >
                  Ação
                </TableSortLabel>
              </TableCell>
              <TableCell sortDirection={orderBy === "data_compra" ? order : false}>
                <TableSortLabel
                  active={orderBy === "data_compra"}
                  direction={orderBy === "data_compra" ? order : "asc"}
                  onClick={() => handleRequestSort("data_compra")}
                >
                  Data Compra
                </TableSortLabel>
              </TableCell>
              <TableCell
                align="center"
                sortDirection={orderBy === "preco_unitario" ? order : false}
              >
                <TableSortLabel
                  active={orderBy === "preco_unitario"}
                  direction={orderBy === "preco_unitario" ? order : "asc"}
                  onClick={() => handleRequestSort("preco_unitario")}
                >
                  Preço Unitário
                </TableSortLabel>
              </TableCell>
              <TableCell
                align="center"
                sortDirection={orderBy === "quantidade" ? order : false}
              >
                <TableSortLabel
                  active={orderBy === "quantidade"}
                  direction={orderBy === "quantidade" ? order : "asc"}
                  onClick={() => handleRequestSort("quantidade")}
                >
                  Quantidade
                </TableSortLabel>
              </TableCell>
              <TableCell
                align="center"
                sortDirection={orderBy === "valor_total_compra" ? order : false}
              >
                <TableSortLabel
                  active={orderBy === "valor_total_compra"}
                  direction={orderBy === "valor_total_compra" ? order : "asc"}
                  onClick={() => handleRequestSort("valor_total_compra")}
                >
                  Valor Total Compra
                </TableSortLabel>
              </TableCell>

              {/* POSICIONADAS */}
              {tabIndex === 1 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "valor_alvo" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "valor_alvo"}
                    direction={orderBy === "valor_alvo" ? order : "asc"}
                    onClick={() => handleRequestSort("valor_alvo")}
                  >
                    Alvo (R$)
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 1 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "dias" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "dias"}
                    direction={orderBy === "dias" ? order : "asc"}
                    onClick={() => handleRequestSort("dias")}
                  >
                    Dias Posicionado
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 1 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "preco_atual" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "preco_atual"}
                    direction={orderBy === "preco_atual" ? order : "asc"}
                    onClick={() => handleRequestSort("preco_atual")}
                  >
                    Preço Atual
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 1 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "variacao" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "variacao"}
                    direction={orderBy === "variacao" ? order : "asc"}
                    onClick={() => handleRequestSort("variacao")}
                  >
                    Variação (%)
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 1 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "to_gain" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "to_gain"}
                    direction={orderBy === "to_gain" ? order : "asc"}
                    onClick={() => handleRequestSort("to_gain")}
                  >
                    To Gain (%)
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 1 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "status" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "status"}
                    direction={orderBy === "status" ? order : "asc"}
                    onClick={() => handleRequestSort("status")}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
              )}

              {/* REALIZADAS */}
              {tabIndex === 2 && (
                <TableCell sortDirection={orderBy === "data_venda" ? order : false}>
                  <TableSortLabel
                    active={orderBy === "data_venda"}
                    direction={orderBy === "data_venda" ? order : "asc"}
                    onClick={() => handleRequestSort("data_venda")}
                  >
                    Data Venda
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 2 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "preco_venda_unitario" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "preco_venda_unitario"}
                    direction={orderBy === "preco_venda_unitario" ? order : "asc"}
                    onClick={() => handleRequestSort("preco_venda_unitario")}
                  >
                    Preço Venda
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 2 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "valor_total_venda" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "valor_total_venda"}
                    direction={orderBy === "valor_total_venda" ? order : "asc"}
                    onClick={() => handleRequestSort("valor_total_venda")}
                  >
                    Valor Total Venda
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 2 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "pct_resultado" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "pct_resultado"}
                    direction={orderBy === "pct_resultado" ? order : "asc"}
                    onClick={() => handleRequestSort("pct_resultado")}
                  >
                    % Resultado
                  </TableSortLabel>
                </TableCell>
              )}
              {tabIndex === 2 && (
                <TableCell
                  align="center"
                  sortDirection={orderBy === "valor_resultado" ? order : false}
                >
                  <TableSortLabel
                    active={orderBy === "valor_resultado"}
                    direction={orderBy === "valor_resultado" ? order : "asc"}
                    onClick={() => handleRequestSort("valor_resultado")}
                  >
                    Valor Resultado
                  </TableSortLabel>
                </TableCell>
              )}

              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedOperacoes.map((op) => {
              const variacao = calcVariacaoPercentual(op);
              const variacaoLabel = variacao != null ? variacao.toFixed(2) : "-";

              const toGain = calcToGainPercentual(op);
              const toGainLabel = toGain != null ? toGain.toFixed(2) : "-";

              const dias = calcDiasPosicionado(op);

              const totalCompra = calcTotalCompra(op);
              const totalVenda = calcTotalVenda(op);

              const pctResultado = calcPctResultado(op);
              const pctResultadoLabel = pctResultado != null ? pctResultado.toFixed(2) : "-";

              const valorResultado = calcValorResultado(op);

              return (
                <TableRow key={op.id}>
                  <TableCell>{op.acao_nome}</TableCell>
                  <TableCell>{op.data_compra}</TableCell>
                  <TableCell align="center">{formatCurrency(op.preco_unitario)}</TableCell>
                  <TableCell align="center">{op.quantidade}</TableCell>
                  <TableCell align="center">{formatCurrency(totalCompra)}</TableCell>

                  {tabIndex === 1 && <TableCell align="center">{formatCurrency(op.valor_alvo)}</TableCell>}
                  {tabIndex === 1 && <TableCell align="center">{dias ?? "-"}</TableCell>}
                  {tabIndex === 1 && <TableCell align="center">{op.preco_atual != null ? formatCurrency(op.preco_atual) : "-"}</TableCell>}
                  {tabIndex === 1 && (
                    <TableCell
                      align="center"
                      sx={{ color: variacao != null ? (variacao >= 0 ? "green" : "red") : "inherit" }}
                    >
                      {variacao != null ? `${variacaoLabel}%` : "-"}
                    </TableCell>
                  )}
                  {tabIndex === 1 && (
                    <TableCell
                      align="center"
                      sx={{ color: toGain != null ? (toGain <= 0 ? "green" : "orange") : "inherit" }}
                    >
                      {toGain != null ? `${toGainLabel}%` : "-"}
                    </TableCell>
                  )}

                  {tabIndex === 1 && (
                    <TableCell align="center">
                      {(() => {
                        const raw = op.status;
                        const label = raw && raw !== 'manual' ? String(raw) : 'n/d';
                        let chipColor = 'default';
                        if (label === 'executada') chipColor = 'success';
                        else if (label === 'parcial') chipColor = 'warning';
                        else if (label === 'pendente') chipColor = 'info';
                        else if (label === 'falha') chipColor = 'error';
                        return <Chip size="small" label={label} color={chipColor} variant={label==='n/d' ? 'outlined' : 'filled'} />;
                      })()}
                    </TableCell>
                  )}

                  {tabIndex === 2 && <TableCell>{op.data_venda}</TableCell>}
                  {tabIndex === 2 && <TableCell align="center">{formatCurrency(totalVenda)}</TableCell>}
                  {tabIndex === 2 && <TableCell align="center">{formatCurrency(totalVenda)}</TableCell>}
                  {tabIndex === 2 && (
                    <TableCell
                      align="center"
                      sx={{ color: pctResultado != null ? (pctResultado >= 0 ? "green" : "red") : "inherit" }}
                    >
                      {pctResultado != null ? `${pctResultadoLabel}%` : "-"}
                    </TableCell>
                  )}
                  {tabIndex === 2 && (
                    <TableCell align="center" sx={{ color: valorResultado == null ? "inherit" : (valorResultado >= 0 ? "green" : "red"), fontWeight: valorResultado == null ? "normal" : 600 }}>
                      {valorResultado == null ? "-" : formatCurrency(valorResultado)}
                    </TableCell>
                  )}

                  <TableCell>
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => openOperacaoModal(op)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Deletar">
                      <IconButton size="small" color="error" onClick={() => handleDelete(op.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {tabIndex === 1 && (
                      <Tooltip title="Vender (MT5)">
                        <Button size="small" variant="contained" color="warning" onClick={() => abrirVenda(op)} sx={{ ml: 1 }}>
                          Vender
                        </Button>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <OperacaoModal
        open={operationModalOpen}
        onClose={closeOperacaoModal}
        operacao={operationEditing}
        clienteId={Number(id)}
        clienteNome={cliente?.nome}
        acoes={acoesDisponiveis}
        onAfterSave={async () => {
          await carregarOperacoes();
          await fetchResumo();
        }}
      />

      {/* Modal: Selecionar recomendação */}
      <Dialog open={openRecModal} onClose={() => setOpenRecModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Selecionar recomendação</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ticker</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Origem</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell align="right">Cotação atual</TableCell>
                <TableCell align="right">Alvo sugerido (5%)</TableCell>
                <TableCell align="right">Prob.</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recsDisponiveis.map((r) => {
                const cotRef = r.cotacao_atual != null ? Number(r.cotacao_atual) : (r.preco_compra != null ? Number(r.preco_compra) : null);
                const alvo5 = r.alvo_sugerido_5pct != null ? Number(r.alvo_sugerido_5pct) : (cotRef != null ? cotRef * 1.05 : null);
                const probLabel = r.probabilidade != null
                  ? `${Number(r.probabilidade).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                  : "-";
                const tipoLabel = (r.lado || "").toLowerCase() === "venda" ? "Venda" : "Compra";
                const origemLabel = r.origem === "ia" ? "IA" : "Clássica";
                return (
                  <TableRow key={r.key || r.acao_id || r.ticker}>
                    <TableCell>{r.ticker}</TableCell>
                    <TableCell>{tipoLabel}</TableCell>
                    <TableCell>{origemLabel}</TableCell>
                    <TableCell>{r.empresa}</TableCell>
                    <TableCell align="right">{formatCurrency(cotRef)}</TableCell>
                    <TableCell align="right">{formatCurrency(alvo5)}</TableCell>
                    <TableCell align="right">{probLabel}</TableCell>
                    <TableCell>
                      <Button variant="contained" size="small" onClick={() => confirmarRecomendacao(r)}>Selecionar</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRecModal(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Nova Compra MT5 */}
      <Dialog open={openNovaCompraModal} onClose={() => setOpenNovaCompraModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nova Compra (MT5) — {recSelecionada?.ticker}</DialogTitle>
        <DialogContent>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            <Typography variant="subtitle2">{cliente?.nome || "-"}</Typography>
            <Typography variant="body2"><strong>Patrimônio:</strong> R$ {formatCurrency(patrimonioCliente)}</Typography>
            <Typography variant="body2"><strong>% liberado:</strong> {percentualLiberado != null ? `${percentualLiberado}%` : "-"}</Typography>
            <Typography variant="body2"><strong>Disponível pelo %:</strong> R$ {formatCurrency(valorDisponivelAplicacao)}</Typography>
            <Typography variant="body2"><strong>VALOR MÁX desta compra:</strong> R$ {formatCurrency(valorMaxCompra)}</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
            <Typography variant="body2"><strong>Cotação atual:</strong> {cotacaoAtual != null ? `R$ ${formatCurrency(cotacaoAtual)}` : "-"}</Typography>
            <Typography variant="body2"><strong>Alvo sugerido (5%):</strong> {alvoSugerido5 != null ? `R$ ${formatCurrency(alvoSugerido5)}` : "-"}</Typography>
            <Tooltip title={cotacaoAtualLoading ? "Atualizando..." : "Atualizar cotação"}>
              <span>
                <IconButton
                  size="small"
                  onClick={atualizarCotacaoAtual}
                  disabled={cotacaoAtualLoading || !recSelecionada?.ticker}
                >
                  {cotacaoAtualLoading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField select label="Execução" value={execucao} onChange={(e) => setExecucao(e.target.value)}>
              <MenuItem value="mercado">Mercado</MenuItem>
              <MenuItem value="limite">Limite</MenuItem>
            </TextField>
            {execucao === "limite" && (
              <TextField label="Preço Limite" type="number" value={precoLimite} onChange={(e) => setPrecoLimite(e.target.value)} />
            )}

            <FormLabel>Entrada</FormLabel>
            <RadioGroup row value={modoEntrada} onChange={(e) => setModoEntrada(e.target.value)}>
              <FormControlLabel value="quantidade" control={<Radio />} label="Quantidade" />
              <FormControlLabel value="valor" control={<Radio />} label="Valor (R$)" />
            </RadioGroup>

            {modoEntrada === "quantidade" ? (
              <TextField label="Quantidade desejada" type="number" value={qtdDesejada} onChange={(e) => setQtdDesejada(e.target.value)} />
            ) : (
              <TextField label="Valor desejado (R$)" type="number" value={valorDesejado} onChange={(e) => setValorDesejado(e.target.value)} />
            )}

            <TextField label="Alvo (TP)" type="number" value={tpAlvo} onChange={(e) => setTpAlvo(e.target.value)} />

            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={validarDistribuicao}>Validar</Button>
              <Chip label={`Legs: ${legsSugeridas.length}`} />
            </Stack>

            {legsSugeridas.map((l, idx) => {
              const valorLeg = valorEstimadoLegs[idx]?.valorEstimado;
              return (
                <Stack key={`${l.symbol}-${idx}`} direction="row" spacing={2} alignItems="center">
                  <TextField label="Símbolo" value={l.symbol} size="small" InputProps={{ readOnly: true }} />
                  <TextField label="Quantidade" type="number" value={l.quantidade} size="small" onChange={(e) => {
                    const v = e.target.value;
                    setLegsSugeridas((old) => old.map((x, i) => i === idx ? { ...x, quantidade: v } : x));
                  }} />
                  <TextField
                    label="Valor estimado (R$)"
                    value={valorLeg != null ? formatCurrency(valorLeg) : "-"}
                    size="small"
                    InputProps={{ readOnly: true }}
                  />
                </Stack>
              );
            })}

            {valorEstimadoTotal != null && (
              <Typography variant="body2" color={excedeValorMaximo ? "error" : "text.primary"}>
                Valor estimado total: R$ {formatCurrency(valorEstimadoTotal)} {excedeValorMaximo ? "(acima do VALOR MÁX)" : ""}
              </Typography>
            )}
            {valorMaxCompra != null && (
              <Typography variant="caption" color={excedeValorMaximo ? "error" : "text.secondary"}>
                VALOR MÁX permitido: R$ {formatCurrency(valorMaxCompra)}
              </Typography>
            )}

            {validacoesLegs?.length > 0 && (
              <Stack spacing={0.5}>
                {validacoesLegs.map((v, i) => (
                  <Typography key={i} variant="caption" color={v.ok ? "green" : "red"}>
                    {v.symbol}: {v.ok ? "OK" : (v.motivo || "inválido")}
                  </Typography>
                ))}
              </Stack>
            )}

            {groupId && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">Acompanhamento (grupo {groupId})</Typography>
                {compraStatus?.summary?.map((s, i) => (
                  <Typography key={i} variant="caption">
                    {s.symbol}: {s.executada ? `executada vol ${s.volume}` : `parcial vol ${s.volume_exec ?? 0}`}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNovaCompraModal(false)} disabled={comprando}>Cancelar</Button>
          <Button variant="contained" onClick={enviarCompra} disabled={comprando || legsSugeridas.length === 0 || excedeValorMaximo}>Enviar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={alerta.open}
        autoHideDuration={6000}
        onClose={fecharAlerta}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={fecharAlerta} severity={alerta.severity} variant="filled" sx={{ width: "100%" }}>
          {alerta.text}
        </Alert>
      </Snackbar>

      <Backdrop sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }} open={loading}>
        <CircularProgress color="inherit" />
        <Typography sx={{ ml: 2 }}>Aguarde, carregando dados da carteira...</Typography>
      </Backdrop>

      {/* Modal: Venda MT5 */}
      <Dialog open={openVendaModal} onClose={() => setOpenVendaModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Vender — {opParaVenda?.acao_nome}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Quantidade total" value={opParaVenda?.quantidade ?? ""} InputProps={{ readOnly: true }} />
            <TextField select label="Execução" value={execucaoVenda} onChange={(e) => setExecucaoVenda(e.target.value)}>
              <MenuItem value="mercado">Mercado</MenuItem>
              <MenuItem value="limite">Limite</MenuItem>
            </TextField>
            {execucaoVenda === "limite" && (
              <TextField label="Preço Limite" type="number" value={precoLimiteVenda} onChange={(e) => setPrecoLimiteVenda(e.target.value)} />
            )}

            {vendaGroupId && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">Acompanhamento (grupo {vendaGroupId})</Typography>
                {vendaStatus?.summary?.map((s, i) => (
                  <Typography key={i} variant="caption">
                    {s.symbol}: {s.executada ? `executada vol ${s.volume}` : `parcial vol ${s.volume_exec ?? 0}`}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenVendaModal(false)} disabled={vendendo}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={confirmarVenda} disabled={vendendo}>Confirmar Venda</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

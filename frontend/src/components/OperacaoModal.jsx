import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Typography,
} from "@mui/material";
import api from "../services/api";

const toInputValue = (value) => {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

export default function OperacaoModal({
  open,
  onClose,
  operacao,
  clienteId,
  clienteNome,
  acoes = [],
  onAfterSave,
}) {
  const isEditing = Boolean(operacao?.id);
  const [acao, setAcao] = useState("");
  const [dataCompra, setDataCompra] = useState("");
  const [precoUnitario, setPrecoUnitario] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [valorAlvo, setValorAlvo] = useState("");
  const [dataVenda, setDataVenda] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (operacao) {
      setAcao(operacao.acao ?? "");
      setDataCompra(toInputValue(operacao.data_compra || ""));
      setPrecoUnitario(
        operacao.preco_unitario != null ? String(operacao.preco_unitario) : ""
      );
      setQuantidade(
        operacao.quantidade != null ? String(operacao.quantidade) : ""
      );
      setValorAlvo(
        operacao.valor_alvo != null ? String(operacao.valor_alvo) : ""
      );
      setDataVenda(toInputValue(operacao.data_venda || ""));
      setPrecoVenda(
        operacao.preco_venda_unitario != null
          ? String(operacao.preco_venda_unitario)
          : ""
      );
    } else {
      setAcao("");
      setDataCompra("");
      setPrecoUnitario("");
      setQuantidade("");
      setValorAlvo("");
      setDataVenda("");
      setPrecoVenda("");
    }
    setError(null);
  }, [operacao, open]);

  const clienteFinal = useMemo(() => {
    if (clienteId != null) return Number(clienteId);
    if (operacao?.cliente != null) return Number(operacao.cliente);
    return null;
  }, [clienteId, operacao]);

  const handleClose = () => {
    if (saving) return;
    onClose?.();
  };

  const handleSubmit = async () => {
    if (!clienteFinal) {
      setError("Cliente inválido para salvar a operação.");
      return;
    }
    if (!acao) {
      setError("Selecione a ação.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      cliente: clienteFinal,
      acao: Number(acao),
      data_compra: dataCompra || null,
      preco_unitario: precoUnitario !== "" ? Number(precoUnitario) : null,
      quantidade: quantidade !== "" ? Number(quantidade) : null,
      data_venda: dataVenda || null,
      preco_venda_unitario: precoVenda !== "" ? Number(precoVenda) : null,
      valor_alvo: valorAlvo !== "" ? Number(valorAlvo) : null,
    };

    const endpoint = isEditing ? `operacoes/${operacao.id}/` : "operacoes/";
    const method = isEditing ? "PATCH" : "POST";
    try {
      await api(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (onAfterSave) {
        await onAfterSave();
      }
      onClose?.();
    } catch (err) {
      const detail =
        err?.message || "Erro ao salvar operação. Tente novamente.";
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth>
      <DialogTitle>{isEditing ? "Editar Operação" : "Nova Operação"}</DialogTitle>
      <DialogContent>
        {clienteNome && (
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Cliente: <strong>{clienteNome}</strong>
          </Typography>
        )}
        <TextField
          select
          label="Ação"
          fullWidth
          value={acao}
          onChange={(e) => setAcao(e.target.value)}
          sx={{ mt: 1 }}
          disabled={saving}
        >
          {acoes.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.ticker}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Data Compra"
          type="date"
          fullWidth
          value={dataCompra}
          onChange={(e) => setDataCompra(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 2 }}
          disabled={saving}
        />
        <TextField
          label="Preço Unitário"
          type="number"
          fullWidth
          value={precoUnitario}
          onChange={(e) => setPrecoUnitario(e.target.value)}
          sx={{ mt: 2 }}
          disabled={saving}
        />
        <TextField
          label="Quantidade"
          type="number"
          fullWidth
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          sx={{ mt: 2 }}
          disabled={saving}
        />
        <TextField
          label="Alvo (R$)"
          type="number"
          fullWidth
          value={valorAlvo}
          onChange={(e) => setValorAlvo(e.target.value)}
          sx={{ mt: 2 }}
          disabled={saving}
        />
        <TextField
          label="Data Venda"
          type="date"
          fullWidth
          value={dataVenda}
          onChange={(e) => setDataVenda(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ mt: 2 }}
          disabled={saving}
        />
        <TextField
          label="Preço Venda"
          type="number"
          fullWidth
          value={precoVenda}
          onChange={(e) => setPrecoVenda(e.target.value)}
          sx={{ mt: 2 }}
          disabled={saving}
        />
        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {isEditing ? "Salvar" : "Criar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

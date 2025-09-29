import { IconButton, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import api from "../../services/api";

export default function Clientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [codigoXP, setCodigoXP] = useState("");
  const [VM, setVM] = useState("");
  const [VMIP, setVMIP] = useState("");
  const [percentualPatrimonio, setPercentualPatrimonio] = useState(""); // NOVO

  const fetchClientes = async () => {
    try {
      const res = await api("clientes/");
      console.log("Clientes recebidos:", res);
      setClientes(res || []); // garante array mesmo se vier vazio
    } catch (err) {
      console.error("Erro ao buscar clientes:", err);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const handleSave = async () => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("Digite um email válido antes de salvar.");
      return;
    }

    const data = {
      nome,
      email,
      documento,
      telefone,
      codigo_xp: codigoXP,
      percentual_patrimonio:
        percentualPatrimonio !== "" ? Number(percentualPatrimonio) : 0,
      vm: VM,
      vm_ip: VMIP,

    };

    if (editing) {
      await api(`clientes/${editing.id}/`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } else {
      await api("clientes/", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    fetchClientes();
    handleClose();
  };

  const handleEdit = (cliente) => {
    setEditing(cliente);
    setNome(cliente.nome || "");
    setEmail(cliente.email || "");
    setDocumento(cliente.documento || "");
    setTelefone(cliente.telefone || "");
    setCodigoXP(cliente.codigo_xp || "");
    setPercentualPatrimonio(cliente.percentual_patrimonio ?? "");
    setVM(cliente.vm);
    setVMIP(cliente.vm_ip);
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Deseja realmente deletar?")) {
      await api(`clientes/${id}/`, { method: "DELETE" });
      fetchClientes();
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
    setNome("");
    setEmail("");
    setDocumento("");
    setTelefone("");
    setCodigoXP("");
    setVM("");
    setVMIP("");
    setPercentualPatrimonio(""); // NOVO
  };

  return (
    <Box sx={{ mt: 12, px: 4 }}>
      <Typography variant="h4" mb={2}>
        Clientes
      </Typography>
      <Button
        variant="contained"
        onClick={() => setOpen(true)}
        sx={{ mb: 2 }}
      >
        Novo Cliente
      </Button>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Documento</TableCell>
            <TableCell>Telefone</TableCell>
            <TableCell>Código XP</TableCell>
            <TableCell>% Patrimônio</TableCell>
            <TableCell>VM Nome</TableCell>
            <TableCell>VM IP</TableCell>
            <TableCell>Ações</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {clientes.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.nome}</TableCell>
              <TableCell>{c.email}</TableCell>
              <TableCell>{c.documento}</TableCell>
              <TableCell>{c.telefone}</TableCell>
              <TableCell>{c.codigo_xp}</TableCell>
              <TableCell>
                {c.percentual_patrimonio != null
                  ? `${c.percentual_patrimonio}%`
                  : "-"}
              </TableCell>
              <TableCell>{c.vm}</TableCell>
              <TableCell>{c.vm_ip}</TableCell>
              <TableCell>
                <Tooltip title="Editar">
                  <IconButton size="small" onClick={() => handleEdit(c)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Deletar">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDelete(c.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Carteira">
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() =>
                      navigate(`/clientes/${c.id}/carteira`)
                    }
                  >
                    <AccountBalanceWalletIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>
          {editing ? "Editar Cliente" : "Novo Cliente"}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Nome"
            fullWidth
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            sx={{ mt: 1 }}
          />
          <TextField
            label="Email"
            fullWidth
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={
              !!email &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            }
            helperText={
              email &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                ? "Digite um email válido"
                : ""
            }
            sx={{ mt: 2 }}
          />
          <TextField
            label="Documento (CPF/CNPJ)"
            fullWidth
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            sx={{ mt: 2 }}
          />
          <TextField
            label="Telefone"
            fullWidth
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            sx={{ mt: 2 }}
          />
          <TextField
            label="Código XP"
            fullWidth
            value={codigoXP}
            onChange={(e) => setCodigoXP(e.target.value)}
            sx={{ mt: 2 }}
          />
          <TextField
            label="% Patrimônio"
            type="number"
            fullWidth
            value={percentualPatrimonio}
            onChange={(e) => setPercentualPatrimonio(e.target.value)}
            sx={{ mt: 2 }}
            inputProps={{ min: 0, max: 100, step: "0.01" }}
          />
          <TextField
            label="VM Nome"
            fullWidth
            value={VM}
            onChange={(e) => setVM(e.target.value)}
            sx={{ mt: 1 }}
          />
          <TextField
            label="VM IP"
            fullWidth
            value={VMIP}
            onChange={(e) => setVMIP(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained">
            {editing ? "Salvar" : "Criar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// pages/List.jsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Slide,
  Snackbar,
  TablePagination,
} from "@mui/material";
import {
  Close as CloseIcon,
  Refresh as RefreshIcon,
  CloudUpload as CloudUploadIcon,
  InsertDriveFile as FileIcon,
  Public as PublicIcon,
  Gavel as GavelIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import axios from "axios";
import { format } from "date-fns";

const PEP_API = `${import.meta.env.VITE_API_URL}/api/list/pep`;
const SANCTIONS_API = `${import.meta.env.VITE_API_URL}/api/list/sanctions`;

// 🔒 Allowed extensions per target
const PEP_EXTENSIONS = [".csv", ".xlsx"];   // International PEPs — csv / xlsx
const SANCTIONS_EXTENSIONS = [".xml"];      // UK Sanctions — xml only

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const scrollbarStyles = {
  "&::-webkit-scrollbar": { width: "8px", height: "8px" },
  "&::-webkit-scrollbar-track": {
    backgroundColor: "#f1f1f1",
    borderRadius: "4px",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "#DAA520",
    borderRadius: "4px",
    "&:hover": { backgroundColor: "#b8860b" },
  },
};

const List = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [pepData, setPepData] = useState([]);
  const [sanctionsData, setSanctionsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Upload dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null); // "peps" | "sanctions"
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);

  // Pagination
  const [page1, setPage1] = useState(0);
  const [rowsPerPage1, setRowsPerPage1] = useState(10);
  const [page2, setPage2] = useState(0);
  const [rowsPerPage2, setRowsPerPage2] = useState(10);

  // Snackbar
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const getContainerMargin = () => (isMobile ? "0px" : "84px");
  const getContainerWidth = () => (isMobile ? "100%" : "calc(100% - 96px)");

  const showSnackbar = (message, severity = "success") =>
    setSnackbar({ open: true, message, severity });

  const handleSnackbarClose = () =>
    setSnackbar((s) => ({ ...s, open: false }));

  // 🔒 Return the allowed list for the current target
  const getAllowedExtensions = () =>
    uploadTarget === "peps" ? PEP_EXTENSIONS : SANCTIONS_EXTENSIONS;

  // 🔒 Build the `accept` attribute string (e.g. ".csv,.xlsx")
  const getAcceptAttr = () => getAllowedExtensions().join(",");

  // =========================================================
  // Fetch lists
  // =========================================================
  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");

      const [pepRes, sanctionRes] = await Promise.allSettled([
        axios.get(PEP_API, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${SANCTIONS_API}/all`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setPepData(
        pepRes.status === "fulfilled" ? pepRes.value.data?.data || [] : []
      );
      setSanctionsData(
        sanctionRes.status === "fulfilled"
          ? sanctionRes.value.data?.data || []
          : []
      );

      // Show error only if both failed
      if (
        pepRes.status === "rejected" &&
        sanctionRes.status === "rejected"
      ) {
        setError("Failed to fetch lists");
      }
    } catch (err) {
      console.error("Error fetching lists:", err);
      setError(err.response?.data?.message || "Error fetching lists");
      setPepData([]);
      setSanctionsData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLists();
  }, [fetchLists]);

  // =========================================================
  // Upload flow
  // =========================================================
  const openUploadDialog = (target) => {
    setUploadTarget(target);
    setSelectedFile(null);
    setFileError("");
    setUploadDialogOpen(true);
  };

  const closeUploadDialog = () => {
    setUploadDialogOpen(false);
    setUploadTarget(null);
    setSelectedFile(null);
    setFileError("");
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    const allowed = getAllowedExtensions();
    const valid = allowed.some((ext) => lower.endsWith(ext));

    if (!valid) {
      setSelectedFile(null);
      setFileError(`Invalid file type. Allowed: ${allowed.join(", ")}`);
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
    setFileError("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setFileError("Please choose a file first");
      return;
    }
    if (!uploadTarget) return;

    try {
      setUploading(true);
      const token = localStorage.getItem("token");

      const formData = new FormData();
      formData.append("file", selectedFile);

      const endpoint =
        uploadTarget === "peps"
          ? `${PEP_API}/upload`
          : `${SANCTIONS_API}/upload`;

      const res = await axios.post(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      if (res.data?.success !== false) {
        showSnackbar(
          `${
            uploadTarget === "peps" ? "International PEPs" : "UK Sanctions"
          } list uploaded successfully`,
          "success"
        );
        closeUploadDialog();
        fetchLists();
      } else {
        showSnackbar(res.data?.message || "Upload failed", "error");
      }
    } catch (err) {
      console.error("Upload error:", err);
      showSnackbar(err.response?.data?.message || "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  // =========================================================
  // Helpers
  // =========================================================
  const formatDate = (d) => {
    if (!d) return "—";
    try {
      return format(new Date(d), "MMM dd, yyyy");
    } catch {
      return d;
    }
  };

  const paginatedPeps = pepData.slice(
    page1 * rowsPerPage1,
    page1 * rowsPerPage1 + rowsPerPage1
  );
  const paginatedSanctions = sanctionsData.slice(
    page2 * rowsPerPage2,
    page2 * rowsPerPage2 + rowsPerPage2
  );

  const headerCell = {
    fontWeight: "bold",
    minWidth: 120,
    whiteSpace: "nowrap",
    bgcolor: "#fff8e1",
  };

  // =========================================================
  // Table renderers
  // =========================================================
  const renderPepTable = () => (
    <Paper sx={{ mb: 4, borderRadius: 2, overflow: "hidden" }}>
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderBottom: "1px solid #e0e0e0",
          bgcolor: "#fafafa",
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PublicIcon sx={{ color: "#DAA520" }} />
          <Typography variant="h6" fontWeight="bold">
            International PEPs
          </Typography>
          <Chip label={pepData.length} size="small" color="warning" sx={{ ml: 1 }} />
        </Box>
        <Button
          variant="contained"
          startIcon={<CloudUploadIcon />}
          onClick={() => openUploadDialog("peps")}
          sx={{ bgcolor: "#DAA520", color: "#000", "&:hover": { bgcolor: "#b8860b" } }}
        >
          Add International PEP
        </Button>
      </Box>

      {pepData.length === 0 ? (
        <Box sx={{ p: 6, textAlign: "center" }}>
          <PublicIcon sx={{ fontSize: 48, color: "#ccc", mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No International PEP records yet. Click <b>Add List</b> to upload a{" "}
            <b>.csv</b> or <b>.xlsx</b> file.
          </Typography>
        </Box>
      ) : (
        <>
          <TableContainer sx={{ maxHeight: 420, overflow: "auto", ...scrollbarStyles }}>
            <Table stickyHeader size="medium">
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCell}>#</TableCell>
                  <TableCell sx={headerCell}>Name</TableCell>
                  <TableCell sx={headerCell}>Aliases</TableCell>
                  <TableCell sx={headerCell}>Country</TableCell>
                  <TableCell sx={headerCell}>Source</TableCell>
                  
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedPeps.map((p, index) => {
                  const actualIndex = page1 * rowsPerPage1 + index;
                  return (
                    <TableRow
                      key={p.id || `pep-${actualIndex}`}
                      sx={{
                        "&:hover": { bgcolor: "#fafafa" },
                        "&:nth-of-type(odd)": { bgcolor: "#fafafa" },
                      }}
                    >
                      <TableCell>{actualIndex + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {p.name || p.fullName || "—"}
                      </TableCell>
                      <TableCell>{p.aliases || "—"}</TableCell>
                      <TableCell>{p.country || "—"}</TableCell>
                      <TableCell>{p.source || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={pepData.length}
            rowsPerPage={rowsPerPage1}
            page={page1}
            onPageChange={(e, np) => setPage1(np)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage1(parseInt(e.target.value, 10));
              setPage1(0);
            }}
            sx={{
              borderTop: "1px solid #e0e0e0",
              "& .MuiTablePagination-select": { color: "#DAA520" },
              "& .MuiTablePagination-actions .MuiIconButton-root": {
                color: "#DAA520",
                "&:hover": { backgroundColor: "rgba(218, 165, 32, 0.1)" },
              },
            }}
          />
        </>
      )}
    </Paper>
  );

 const renderSanctionsTable = () => (
  <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
    <Box
      sx={{
        p: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        borderBottom: "1px solid #e0e0e0",
        bgcolor: "#fafafa",
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <GavelIcon sx={{ color: "#DAA520" }} />
        <Typography variant="h6" fontWeight="bold">
          UK-Sanctions-List
        </Typography>
        <Chip label={sanctionsData.length} size="small" color="warning" sx={{ ml: 1 }} />
      </Box>
      <Button
        variant="contained"
        startIcon={<CloudUploadIcon />}
        onClick={() => openUploadDialog("sanctions")}
        sx={{ bgcolor: "#DAA520", color: "#000", "&:hover": { bgcolor: "#b8860b" } }}
      >
        Add UK-Sanctions
      </Button>
    </Box>

    {sanctionsData.length === 0 ? (
      <Box sx={{ p: 6, textAlign: "center" }}>
        <GavelIcon sx={{ fontSize: 48, color: "#ccc", mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          No UK Sanctions records yet. Click <b>Add List</b> to upload an{" "}
          <b>.xml</b> file.
        </Typography>
      </Box>
    ) : (
      <>
        <TableContainer sx={{ maxHeight: 420, overflow: "auto", ...scrollbarStyles }}>
          <Table stickyHeader size="medium">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCell}>#</TableCell>
                <TableCell sx={headerCell}>Name</TableCell>
                <TableCell sx={headerCell}>Regime</TableCell>
                <TableCell sx={headerCell}>Designation Source</TableCell>
                <TableCell sx={headerCell}>Sanctions Imposed</TableCell>
                <TableCell sx={headerCell}>Date Designated</TableCell>
                <TableCell sx={headerCell}>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedSanctions.map((s, index) => {
                const actualIndex = page2 * rowsPerPage2 + index;
                return (
                  <TableRow
                    key={s.id || `sanction-${actualIndex}`}
                    sx={{
                      "&:hover": { bgcolor: "#fafafa" },
                      "&:nth-of-type(odd)": { bgcolor: "#fafafa" },
                    }}
                  >
                    <TableCell>{actualIndex + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {s.name || "—"}
                    </TableCell>
                    <TableCell>{s.regime || "—"}</TableCell>
                    <TableCell>{s.designation_source || "—"}</TableCell>
                    <TableCell>{s.sanctions_imposed || "—"}</TableCell>
                    <TableCell>
                      {s.date_designated ? formatDate(s.date_designated) : "—"}
                    </TableCell>
                    <TableCell>
                      {s.last_updated ? formatDate(s.last_updated) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={sanctionsData.length}
          rowsPerPage={rowsPerPage2}
          page={page2}
          onPageChange={(e, np) => setPage2(np)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage2(parseInt(e.target.value, 10));
            setPage2(0);
          }}
          sx={{
            borderTop: "1px solid #e0e0e0",
            "& .MuiTablePagination-select": { color: "#DAA520" },
            "& .MuiTablePagination-actions .MuiIconButton-root": {
              color: "#DAA520",
              "&:hover": { backgroundColor: "rgba(218, 165, 32, 0.1)" },
            },
          }}
        />
      </>
    )}
  </Paper>
);

  // =========================================================
  // Render
  // =========================================================
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f5f5f5", py: isMobile ? 1 : 2 }}>
      <Container
        maxWidth={false}
        sx={{
          width: getContainerWidth(),
          ml: getContainerMargin(),
          mr: isMobile ? 0 : "12px",
          px: { xs: 1, sm: 2, md: 0.5 },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <FileIcon sx={{ fontSize: 32, color: "#DAA520" }} />
            <Typography variant={isMobile ? "h5" : "h4"} fontWeight="bold" color="#DAA520">
              Lists
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchLists}
            disabled={loading}
            sx={{ borderColor: "#DAA520", color: "#DAA520" }}
          >
            Refresh
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading && pepData.length === 0 && sanctionsData.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: "#DAA520" }} />
          </Box>
        ) : (
          <>
            {renderPepTable()}
            {renderSanctionsTable()}
          </>
        )}

        {/* Upload Dialog */}
        <Dialog
          open={uploadDialogOpen}
          onClose={closeUploadDialog}
          slots={{ transition: Transition }}
          keepMounted
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CloudUploadIcon sx={{ color: "#DAA520" }} />
              <Typography variant="h6">
                Add {uploadTarget === "peps" ? "International PEPs" : "UK-Sanctions-List"}
              </Typography>
            </Box>
            <IconButton
              onClick={closeUploadDialog}
              sx={{
                color: "#ff4444",
                border: "1px solid #ff4444",
                borderRadius: "50%",
                width: 34,
                height: 34,
                "&:hover": { bgcolor: "rgba(255, 68, 68, 0.1)" },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent dividers>
            <Box sx={{ py: 1 }}>
              {/* 🔒 Accepted files list — dynamic per target */}
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Accepted file types:{" "}
                {getAllowedExtensions().map((ext, i) => (
                  <React.Fragment key={ext}>
                    {i > 0 && ", "}
                    <b>{ext}</b>
                  </React.Fragment>
                ))}
              </Typography>

              <Box
                sx={{
                  mt: 2,
                  p: 3,
                  border: "2px dashed #DAA520",
                  borderRadius: 2,
                  textAlign: "center",
                  bgcolor: "#fffdf5",
                }}
              >
                {/* 🔒 Key + accept are dynamic so reset happens per-target */}
                <input
                  key={uploadTarget}
                  accept={getAcceptAttr()}
                  id="list-upload-input"
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <label htmlFor="list-upload-input">
                  <Button
                    component="span"
                    variant="outlined"
                    startIcon={<FileIcon />}
                    sx={{ borderColor: "#DAA520", color: "#DAA520" }}
                  >
                    Browse File
                  </Button>
                </label>

                {selectedFile && (
                  <Box
                    sx={{
                      mt: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1,
                    }}
                  >
                    <CheckCircleIcon sx={{ color: "success.main", fontSize: 20 }} />
                    <Typography variant="body2">
                      {selectedFile.name}{" "}
                      <Typography component="span" variant="caption" color="text.secondary">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </Typography>
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setSelectedFile(null)}
                      sx={{ color: "#ff4444" }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </Box>

              {fileError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {fileError}
                </Alert>
              )}
            </Box>
          </DialogContent>

          <DialogActions sx={{ p: 2, gap: 1 }}>
            <Button
              onClick={closeUploadDialog}
              variant="outlined"
              sx={{ borderColor: "#666", color: "#666" }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              variant="contained"
              disabled={uploading || !selectedFile}
              startIcon={
                uploading ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <CloudUploadIcon />
                )
              }
              sx={{
                bgcolor: "#DAA520",
                color: "#000",
                "&:hover": { bgcolor: "#b8860b" },
                "&:disabled": { bgcolor: "#ccc", color: "#666" },
              }}
            >
              {uploading ? "Uploading..." : "Upload & Update"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <Alert
            onClose={handleSnackbarClose}
            severity={snackbar.severity}
            sx={{ width: "100%" }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
};

export default List;
// pages/Search.jsx
import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  TextField,
  InputAdornment,
  Chip,
  Grid,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Button,
  Tooltip,
  Alert,
  Snackbar,
  TablePagination,
  Badge,
  Divider,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  Public as PublicIcon,
  Gavel as GavelIcon,
  Home as HomeIcon,
} from "@mui/icons-material";
import axios from "axios";
import { format } from "date-fns";

// =========================================================
// Helpers (module-level)
// =========================================================

const COUNTRY_NAMES = {
  ad: "Andorra", ae: "UAE", af: "Afghanistan", al: "Albania",
  am: "Armenia", ar: "Argentina", at: "Austria", au: "Australia",
  az: "Azerbaijan", ba: "Bosnia & Herzegovina", be: "Belgium",
  bg: "Bulgaria", br: "Brazil", by: "Belarus", ca: "Canada",
  ch: "Switzerland", cn: "China", cy: "Cyprus", cz: "Czechia",
  de: "Germany", dk: "Denmark", dz: "Algeria", ee: "Estonia",
  eg: "Egypt", es: "Spain", fi: "Finland", fr: "France",
  gb: "United Kingdom", ge: "Georgia", gr: "Greece", hr: "Croatia",
  hu: "Hungary", ie: "Ireland", il: "Israel", in: "India",
  iq: "Iraq", ir: "Iran", is: "Iceland", it: "Italy",
  jp: "Japan", ke: "Kenya", kr: "South Korea", kw: "Kuwait",
  kz: "Kazakhstan", lb: "Lebanon", lt: "Lithuania", lu: "Luxembourg",
  lv: "Latvia", ma: "Morocco", mc: "Monaco", md: "Moldova",
  me: "Montenegro", mk: "North Macedonia", mt: "Malta", mx: "Mexico",
  nl: "Netherlands", no: "Norway", nz: "New Zealand", pl: "Poland",
  pt: "Portugal", qa: "Qatar", ro: "Romania", rs: "Serbia",
  ru: "Russia", sa: "Saudi Arabia", se: "Sweden", sg: "Singapore",
  si: "Slovenia", sk: "Slovakia", sy: "Syria", tn: "Tunisia",
  tr: "Türkiye", ua: "Ukraine", uk: "United Kingdom", us: "United States",
  za: "South Africa",
};

const formatCountry = (raw) => {
  if (!raw) return "—";
  const codes = String(raw).split(/[;,]\s*/).filter(Boolean);
  if (!codes.length) return "—";
  return codes
    .map((c) => COUNTRY_NAMES[c.toLowerCase()] || c.toUpperCase())
    .join(", ");
};

const formatBirthDate = (raw) => {
  if (!raw) return "—";
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const year =
      yy.length === 2 ? (parseInt(yy) < 30 ? `20${yy}` : `19${yy}`) : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return str;
};

const safeFormatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return format(d, "MMM dd, yyyy");
  } catch {
    return String(dateString);
  }
};

// Extract primary name + aliases from the JSON `names` blob
const parseSanctionsNames = (namesValue) => {
  const result = { primaryName: null, aliases: [] };
  if (!namesValue) return result;

  try {
    const parsed =
      typeof namesValue === "string" ? JSON.parse(namesValue) : namesValue;
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    for (const n of arr) {
      if (!n || typeof n !== "object") continue;
      const label = n.Name6 || n.Name1 || n.Name2 || n.Name3 || n.Name4 || n.Name5 || null;

      if (n.NameType === "Primary Name") {
        result.primaryName = label;
      } else if (n.NameType === "Alias") {
        if (label) result.aliases.push(label);
      }
    }

    if (!result.primaryName && arr[0] && typeof arr[0] === "object") {
      result.primaryName =
        arr[0].Name6 || arr[0].Name1 || arr[0].Name2 || arr[0].Name3 || null;
    }
  } catch {
    result.primaryName = typeof namesValue === "string" ? namesValue : null;
  }

  return result;
};

// Extract bullet items from a JSON array-or-object column
const parseJsonList = (value) => {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .map((item) => {
        if (item === null || item === undefined) return null;
        if (typeof item === "string") return item;
        if (typeof item === "object") {
          // Join all sub-fields into a readable line
          const parts = Object.entries(item)
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").trim()}: ${v}`);
          return parts.join(", ");
        }
        return String(item);
      })
      .filter(Boolean);
  } catch {
    return typeof value === "string" ? [value] : [];
  }
};

// =========================================================
// Component
// =========================================================
const Search = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const navigate = useNavigate();

  const [pepResults, setPepResults] = useState([]);
  const [sanctionsResults, setSanctionsResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [name, setName] = useState("");

  const [pepPage, setPepPage] = useState(0);
  const [pepRowsPerPage, setPepRowsPerPage] = useState(10);
  const [sanctionsPage, setSanctionsPage] = useState(0);
  const [sanctionsRowsPerPage, setSanctionsRowsPerPage] = useState(5);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const getContainerMargin = () => (isMobile ? "0px" : "84px");
  const getContainerWidth = () => (isMobile ? "100%" : "calc(100% - 96px)");

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

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  // =========================================================
  // 🔍 Search
  // =========================================================
  const fetchSearchResults = useCallback(async () => {
    if (!name.trim()) {
      setError("Please enter a name to search");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHasSearched(true);

      const token = localStorage.getItem("token");

      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/search/all`,
        {
          params: { name: name.trim() },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        const data = response.data;

        // ---- Normalize PEP rows ----
        const rawPeps = data.International_PEPs || [];
        const peps = rawPeps.map((p) => ({
          id: p.id,
          name: p.name,
          aliases: p.aliases
            ? String(p.aliases)
                .split(/[;,]\s*/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          countries: p.countries,
          birthDate: p.birth_date,
          sources: p.dataset
            ? String(p.dataset)
                .split(";")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          schema: p.schema,
          status: "Active",
          matchDate: p.last_seen || p.last_change,
        }));

        // ---- Normalize Sanctions rows (full document shape) ----
        const rawSanctions = data.UK_Sanctions_List || [];
        const sanctions = rawSanctions.map((row) => {
          const { primaryName, aliases } = parseSanctionsNames(row.names);
          const nonLatin = parseJsonList(row.non_latin_names);
          const addresses = parseJsonList(row.addresses);

          return {
            id: row.unique_id,
            name: primaryName,
            aliases,
            nonLatinNames: nonLatin,
            addresses,
            sanctionsImposed: row.sanctions_imposed,
            listType: row.designation_source,
            regime: row.regime_name,
            listedDate: row.date_designated,
            matchDate: row.last_updated,
          };
        });

        setPepResults(peps);
        setSanctionsResults(sanctions);
        setPepPage(0);
        setSanctionsPage(0);

        const total = peps.length + sanctions.length;
        if (total === 0) {
          showSnackbar("No matches found for this name", "info");
        } else {
          showSnackbar(
            `Found ${peps.length} International PEP(s) and ${sanctions.length} UK Sanction(s)`,
            "success"
          );
        }
      } else {
        setError(
          response.data.error ||
            response.data.message ||
            "Failed to fetch results"
        );
        setPepResults([]);
        setSanctionsResults([]);
      }
    } catch (err) {
      console.error("Error searching:", err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Error searching for name"
      );
      setPepResults([]);
      setSanctionsResults([]);
    } finally {
      setLoading(false);
    }
  }, [name]);

  const handleSearch = (e) => {
    if (e) e.preventDefault();
    fetchSearchResults();
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSearch(e);
  };

  const handleReset = () => {
    setName("");
    setError(null);
    setPepResults([]);
    setSanctionsResults([]);
    setHasSearched(false);
    setPepPage(0);
    setSanctionsPage(0);
  };

  const handleHome = () => navigate("/");
  const handleSnackbarClose = () =>
    setSnackbar((s) => ({ ...s, open: false }));

  const getStatusColor = (status) => {
    if (!status) return "default";
    switch (String(status).toLowerCase()) {
      case "active":
      case "match":
      case "confirmed":
        return "success";
      case "pending":
      case "review":
        return "warning";
      case "inactive":
      case "cleared":
      case "false positive":
        return "error";
      default:
        return "default";
    }
  };

  const paginatedPeps = pepResults.slice(
    pepPage * pepRowsPerPage,
    pepPage * pepRowsPerPage + pepRowsPerPage
  );
  const paginatedSanctions = sanctionsResults.slice(
    sanctionsPage * sanctionsRowsPerPage,
    sanctionsPage * sanctionsRowsPerPage + sanctionsRowsPerPage
  );

  const headerCell = {
    fontWeight: "bold",
    minWidth: 120,
    whiteSpace: "nowrap",
    bgcolor: "#fff8e1",
  };

  // =========================================================
  // Sanction card renderer
  // =========================================================
  const renderSanctionCard = (s, index) => (
    <Paper
      key={s.id || `sanction-${index}`}
      elevation={0}
      sx={{
        mb: 3,
        borderRadius: 2,
        border: "1px solid #e0e0e0",
        overflow: "hidden",
        borderLeft: "4px solid #DAA520",
      }}
    >
      {/* Header bar — title */}
      <Box
        sx={{
          px: 3,
          py: 2,
          bgcolor: "#fffdf5",
          borderBottom: "1px dashed #e0e0e0",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 800,
              color: "#999",
              letterSpacing: 0.5,
              minWidth: 22,
              pt: 0.4,
            }}
          >
            {index + 1}.
          </Typography>
          <Typography
            variant="h6"
            fontWeight={900}
            sx={{
              textTransform: "uppercase",
              color: "#111",
              lineHeight: 1.3,
              letterSpacing: 0.3,
            }}
          >
            {s.name || "—"}
          </Typography>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ p: 3 }}>
        {/* Aliases */}
        {s.aliases && s.aliases.length > 0 && (
          <>
            <Typography
              variant="overline"
              sx={{
                fontWeight: 800,
                color: "#666",
                letterSpacing: 1.5,
                fontSize: "0.7rem",
              }}
            >
              Aliases:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3, mb: 2 }}>
              {s.aliases.map((a, i) => (
                <li key={i}>
                  <Typography variant="body2" sx={{ color: "#333", lineHeight: 1.6 }}>
                    {a}
                  </Typography>
                </li>
              ))}
            </Box>
          </>
        )}

        {/* Non-Latin Names */}
        {s.nonLatinNames && s.nonLatinNames.length > 0 && (
          <>
            <Typography
              variant="overline"
              sx={{
                fontWeight: 800,
                color: "#666",
                letterSpacing: 1.5,
                fontSize: "0.7rem",
              }}
            >
              Non-Latin Names:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3, mb: 2 }}>
              {s.nonLatinNames.map((n, i) => (
                <li key={i}>
                  <Typography
                    variant="body2"
                    sx={{ color: "#333", lineHeight: 1.6, direction: "rtl", textAlign: "left" }}
                  >
                    {n}
                  </Typography>
                </li>
              ))}
            </Box>
          </>
        )}

        {/* Addresses / Origin */}
        {s.addresses && s.addresses.length > 0 && (
          <>
            <Typography
              variant="overline"
              sx={{
                fontWeight: 800,
                color: "#666",
                letterSpacing: 1.5,
                fontSize: "0.7rem",
              }}
            >
              Address / Origin:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3, mb: 2 }}>
              {s.addresses.map((addr, i) => (
                <li key={i}>
                  <Typography variant="body2" sx={{ color: "#333", lineHeight: 1.6 }}>
                    {addr}
                  </Typography>
                </li>
              ))}
            </Box>
          </>
        )}

        {/* Sanctions Imposed — highlighted strip */}
        {s.sanctionsImposed && (
          <Box
            sx={{
              mt: 2,
              px: 2,
              py: 1.5,
              bgcolor: "#fff0f0",
              borderLeft: "4px solid #e53935",
              borderRadius: 1,
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: "#c62828" }}
            >
              Sanctions:{" "}
              <Box component="span" sx={{ fontWeight: 500, color: "#333" }}>
                {s.sanctionsImposed}
              </Box>
            </Typography>
          </Box>
        )}

        {/* Meta row (regime, list type, dates) */}
        <Box
          sx={{
            mt: 2.5,
            pt: 2,
            borderTop: "1px dashed #e0e0e0",
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          {s.regime && (
            <Chip size="small" label={`Regime: ${s.regime}`} variant="outlined" />
          )}
          {s.listType && (
            <Chip size="small" label={`Type: ${s.listType}`} variant="outlined" />
          )}
          {s.listedDate && (
            <Chip
              size="small"
              label={`Listed: ${safeFormatDate(s.listedDate)}`}
              variant="outlined"
            />
          )}
          <Chip size="small" label={`ID: ${s.id}`} variant="outlined" />
        </Box>
      </Box>
    </Paper>
  );

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
            <SearchIcon sx={{ fontSize: 32, color: "#DAA520" }} />
            <Typography
              variant={isMobile ? "h5" : "h4"}
              fontWeight="bold"
              color="#DAA520"
            >
              Name Search
            </Typography>
            <Badge
              badgeContent={pepResults.length + sanctionsResults.length}
              color="warning"
              sx={{ ml: 1 }}
            >
              <Chip
                icon={<SearchIcon />}
                label="Matches"
                color="warning"
                size="small"
                variant="outlined"
              />
            </Badge>
          </Box>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<HomeIcon />}
              onClick={handleHome}
              sx={{
                borderColor: "#DAA520",
                color: "#DAA520",
                "&:hover": {
                  backgroundColor: "rgba(218, 165, 32, 0.1)",
                  borderColor: "#b8860b",
                },
              }}
            >
              Home
            </Button>

            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchSearchResults}
              disabled={loading || !name.trim()}
              sx={{ borderColor: "#DAA520", color: "#DAA520" }}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        {/* Search Card */}
        <Paper sx={{ mb: 3, borderRadius: 2, p: 2 }}>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                label="Full Name"
                placeholder="Enter full name to search..."
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyPress={handleKeyPress}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={6} md={3}>
              <Button
                fullWidth
                variant="contained"
                onClick={handleSearch}
                disabled={loading || !name.trim()}
                sx={{
                  bgcolor: "#DAA520",
                  color: "#000",
                  "&:hover": { bgcolor: "#b8860b" },
                  "&:disabled": { bgcolor: "#ccc", color: "#666" },
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Search"
                )}
              </Button>
            </Grid>
            <Grid item xs={6} md={3}>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleReset}
                sx={{ borderColor: "#DAA520", color: "#DAA520" }}
              >
                Clear
              </Button>
            </Grid>
          </Grid>

          {error && (
            <Alert
              severity="error"
              sx={{ mt: 2 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}
        </Paper>

        {/* Loading */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress sx={{ color: "#DAA520" }} />
          </Box>
        ) : (
          <>
            {/* ========================================================= */}
            {/* TABLE 1: International PEPs (unchanged)                    */}
            {/* ========================================================= */}
            <Paper sx={{ mb: 3, borderRadius: 2, overflow: "hidden" }}>
              <Box
                sx={{
                  p: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  borderBottom: "1px solid #e0e0e0",
                  bgcolor: "#fafafa",
                }}
              >
                <PublicIcon sx={{ color: "#DAA520" }} />
                <Typography variant="h6" fontWeight="bold">
                  International PEPs
                </Typography>
                <Chip
                  label={pepResults.length}
                  size="small"
                  color="warning"
                  sx={{ ml: 1 }}
                />
              </Box>

              {pepResults.length === 0 ? (
                <Box sx={{ p: 6, textAlign: "center" }}>
                  <PublicIcon sx={{ fontSize: 48, color: "#ccc", mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    {hasSearched
                      ? "No International PEP matches found"
                      : "Search for a name to see International PEP results"}
                  </Typography>
                </Box>
              ) : (
                <>
                  <TableContainer
                    sx={{
                      maxHeight: 420,
                      overflow: "auto",
                      ...scrollbarStyles,
                    }}
                  >
                    <Table stickyHeader size="medium">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={headerCell}>#</TableCell>
                          <TableCell sx={headerCell}>Name</TableCell>
                          <TableCell sx={headerCell}>Aliases</TableCell>
                          <TableCell sx={headerCell}>Country</TableCell>
                          {/* <TableCell sx={headerCell}>Date of Birth</TableCell> */}
                          <TableCell sx={headerCell}>Source</TableCell>
                          {/* <TableCell sx={headerCell}>Status</TableCell> */}
                          {/* <TableCell sx={headerCell}>Match Date</TableCell> */}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedPeps.map((p, index) => {
                          const actualIndex = pepPage * pepRowsPerPage + index;
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
                                {p.name || "—"}
                              </TableCell>
                              <TableCell>
                                {p.aliases && p.aliases.length
                                  ? p.aliases.slice(0, 2).join(", ") +
                                    (p.aliases.length > 2 ? "…" : "")
                                  : "—"}
                              </TableCell>
                              <TableCell>{formatCountry(p.countries)}</TableCell>
                              {/* <TableCell>{formatBirthDate(p.birthDate)}</TableCell> */}
                              <TableCell>
                                {p.sources && p.sources.length
                                  ? p.sources.slice(0, 2).join(" • ")
                                  : "—"}
                              </TableCell>
                              
                              {/* <TableCell>{safeFormatDate(p.matchDate)}</TableCell> */}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <TablePagination
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    component="div"
                    count={pepResults.length}
                    rowsPerPage={pepRowsPerPage}
                    page={pepPage}
                    onPageChange={(e, newPage) => setPepPage(newPage)}
                    onRowsPerPageChange={(e) => {
                      setPepRowsPerPage(parseInt(e.target.value, 10));
                      setPepPage(0);
                    }}
                    sx={{
                      borderTop: "1px solid #e0e0e0",
                      "& .MuiTablePagination-select": { color: "#DAA520" },
                      "& .MuiTablePagination-actions .MuiIconButton-root": {
                        color: "#DAA520",
                        "&:hover": {
                          backgroundColor: "rgba(218, 165, 32, 0.1)",
                        },
                      },
                    }}
                  />
                </>
              )}
            </Paper>

            {/* ========================================================= */}
            {/* SECTION 2: UK-Sanctions-List — CARD GRID (like the pic)    */}
            {/* ========================================================= */}
            <Paper
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                bgcolor: "#fafafa",
              }}
            >
              <Box
                sx={{
                  p: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  borderBottom: "1px solid #e0e0e0",
                  bgcolor: "#fafafa",
                }}
              >
                <GavelIcon sx={{ color: "#DAA520" }} />
                <Typography variant="h6" fontWeight="bold">
                  UK Sanctions List
                </Typography>
                <Badge badgeContent={sanctionsResults.length} color="warning">
                  <Chip
                    label="Matches"
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                </Badge>
              </Box>

              {sanctionsResults.length === 0 ? (
                <Box sx={{ p: 6, textAlign: "center", bgcolor: "#fff" }}>
                  <GavelIcon sx={{ fontSize: 48, color: "#ccc", mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    {hasSearched
                      ? "No UK Sanctions matches found"
                      : "Search for a name to see UK Sanctions results"}
                  </Typography>
                </Box>
              ) : (
                <>
                  {/* Card grid */}
                  <Box sx={{ p: { xs: 2, md: 3 } }}>
                    {paginatedSanctions.map((s, index) => {
                      const actualIndex =
                        sanctionsPage * sanctionsRowsPerPage + index;
                      return renderSanctionCard(s, actualIndex);
                    })}
                  </Box>

                  {/* Pagination */}
                  <TablePagination
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    component="div"
                    count={sanctionsResults.length}
                    rowsPerPage={sanctionsRowsPerPage}
                    page={sanctionsPage}
                    onPageChange={(e, newPage) => setSanctionsPage(newPage)}
                    onRowsPerPageChange={(e) => {
                      setSanctionsRowsPerPage(parseInt(e.target.value, 10));
                      setSanctionsPage(0);
                    }}
                    sx={{
                      bgcolor: "#fff",
                      borderTop: "1px solid #e0e0e0",
                      "& .MuiTablePagination-select": { color: "#DAA520" },
                      "& .MuiTablePagination-actions .MuiIconButton-root": {
                        color: "#DAA520",
                        "&:hover": {
                          backgroundColor: "rgba(218, 165, 32, 0.1)",
                        },
                      },
                    }}
                  />
                </>
              )}
            </Paper>
          </>
        )}

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

export default Search;
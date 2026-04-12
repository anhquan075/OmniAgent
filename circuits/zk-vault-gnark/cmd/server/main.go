package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"zk-vault-gnark/pkg/circuit"
	"zk-vault-gnark/pkg/service"
)

type ProveRequest struct {
	CurrentYear      string `json:"currentYear"`
	RequiredKYCLevel string `json:"requiredKycLevel"`
	SecretKYCData    string `json:"secretKycData"`
	SecretSignature  string `json:"secretSignature"`
	Subject          string `json:"subject"`
	AgentTokenID     string `json:"agentTokenId"`
}

type ProveResponse struct {
	Proof string `json:"proof"` // hex-encoded proof bytes
	Error string `json:"error,omitempty"`
}

// resolveKeysDir finds the target/ dir relative to this binary or source root
func resolveKeysDir() string {
	// 1. Try env override
	if d := os.Getenv("ZK_KEYS_DIR"); d != "" {
		return d
	}
	// 2. Try relative to executable
	exe, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "target")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	// 3. Try relative to source file (dev mode)
	_, filename, _, ok := runtime.Caller(0)
	if ok {
		candidate := filepath.Join(filepath.Dir(filename), "..", "target")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	// 4. Fallback: cwd/target
	return "target"
}

func proveHandler(keysDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			json.NewEncoder(w).Encode(ProveResponse{Error: "method not allowed"})
			return
		}

		var req ProveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ProveResponse{Error: "invalid request: " + err.Error()})
			return
		}

		currentYear, err := strconv.ParseUint(req.CurrentYear, 10, 32)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ProveResponse{Error: "invalid currentYear: " + err.Error()})
			return
		}

		requiredKYCLevel, err := strconv.ParseUint(req.RequiredKYCLevel, 10, 8)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ProveResponse{Error: "invalid requiredKycLevel: " + err.Error()})
			return
		}

		secretKYCData, err := strconv.ParseUint(req.SecretKYCData, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ProveResponse{Error: "invalid secretKycData: " + err.Error()})
			return
		}

		secretSignature, err := strconv.ParseUint(req.SecretSignature, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ProveResponse{Error: "invalid secretSignature: " + err.Error()})
			return
		}

		agentTokenID, err := strconv.ParseUint(req.AgentTokenID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ProveResponse{Error: "invalid agentTokenId: " + err.Error()})
			return
		}

		subjectAddr := strings.ToLower(strings.TrimPrefix(req.Subject, "0x"))
		hash := sha256.Sum256([]byte(subjectAddr))
		subjectUint64 := binary.BigEndian.Uint64(hash[:8])

		pkPath := filepath.Join(keysDir, "pk.bin")
		vkPath := filepath.Join(keysDir, "vk.bin")

		input := circuit.VaultGateInput{
			CurrentYear:      uint32(currentYear),
			RequiredKYCLevel: uint8(requiredKYCLevel),
			SecretKYCData:    secretKYCData,
			SecretSignature:  secretSignature,
			Subject:          subjectUint64,
			AgentTokenID:     agentTokenID,
		}

		proofBytes, err := service.GenerateProofFromKeys(pkPath, vkPath, input)
		if err != nil {
			log.Printf("[prover] error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ProveResponse{Error: err.Error()})
			return
		}

		log.Printf("[prover] proof generated: %d bytes", len(proofBytes))
		json.NewEncoder(w).Encode(ProveResponse{
			Proof: "0x" + hex.EncodeToString(proofBytes),
		})
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
	port := os.Getenv("ZK_PROVER_PORT")
	if port == "" {
		port = "7070"
	}

	keysDir := resolveKeysDir()
	fmt.Printf("[prover] keys dir: %s\n", keysDir)

	// Sanity check key files exist at startup
	for _, name := range []string{"pk.bin", "vk.bin"} {
		path := filepath.Join(keysDir, name)
		if _, err := os.Stat(path); err != nil {
			log.Fatalf("[prover] key file not found: %s", path)
		}
	}
	fmt.Println("[prover] key files OK")

	mux := http.NewServeMux()
	mux.HandleFunc("/prove", proveHandler(keysDir))
	mux.HandleFunc("/health", healthHandler)

	addr := ":" + port
	fmt.Printf("[prover] listening on %s\n", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

import Foundation
import FoundationModels

// ── Entry point ───────────────────────────────────────────────────────────────

@main
struct AppleAICLI {
    static func main() async {
        let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "--check"

        // iCloud status check — works on macOS 12+, must be before the macOS 26 guard
        if mode == "--icloud-status" {
            let token = FileManager.default.ubiquityIdentityToken
            emit(["available": token != nil])
            return
        }

        guard #available(macOS 26.0, *) else {
            emit(["available": false, "reason": "Requires macOS 26 (Tahoe) or later with Apple Intelligence."])
            return
        }

        do {
            switch mode {
            case "--check":
                checkAvailability()
            case "--generate":
                try await generateSingleShot()
            case "--session":
                try await runSession()
            default:
                emit(["error": "Unknown mode. Use --check, --generate, --session, or --icloud-status."])
                exit(1)
            }
        } catch {
            emit(["error": error.localizedDescription])
            exit(1)
        }
    }

    // ── JSON helpers ─────────────────────────────────────────────────────────

    static func emit(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else { return }
        print(str)
        fflush(Foundation.stdout)
    }

    static func readJSONLine() -> [String: Any]? {
        guard let line = readLine(strippingNewline: true),
              let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json
    }

    // ── Availability check ────────────────────────────────────────────────────

    @available(macOS 26.0, *)
    static func checkAvailability() {
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:
            emit(["available": true])
        case .unavailable(let reason):
            let msg: String
            switch reason {
            case .deviceNotEligible:
                msg = "This device does not support Apple Intelligence. An Apple Silicon Mac is required."
            case .appleIntelligenceNotEnabled:
                msg = "Apple Intelligence is not enabled. Open System Settings → Apple Intelligence & Siri to turn it on."
            case .modelNotReady:
                msg = "Apple Intelligence model is still downloading. Please wait a few minutes."
            @unknown default:
                msg = "Apple Intelligence is not available on this device."
            }
            emit(["available": false, "reason": msg])
        }
    }

    // ── Single-shot generation (Assist + Ghostwriter) ─────────────────────────

    @available(macOS 26.0, *)
    static func generateSingleShot() async throws {
        guard let input = readJSONLine(),
              let userPrompt = input["user"] as? String else {
            emit(["error": "Invalid input: expected {\"system\":\"...\",\"user\":\"...\"}"])
            return
        }
        let systemPrompt = input["system"] as? String ?? ""

        let session: LanguageModelSession
        if systemPrompt.isEmpty {
            session = LanguageModelSession()
        } else {
            session = LanguageModelSession {
                systemPrompt
            }
        }

        var previousText = ""
        let stream = session.streamResponse(to: userPrompt)
        for try await snapshot in stream {
            let fullText = snapshot.content
            let delta = String(fullText.dropFirst(previousText.count))
            previousText = fullText
            if !delta.isEmpty {
                emit(["token": delta])
            }
        }
        emit(["done": true])
    }

    // ── Session mode (multi-turn Interview) ──────────────────────────────────

    @available(macOS 26.0, *)
    static func runSession() async throws {
        guard let input = readJSONLine(),
              let systemPrompt = input["system"] as? String else {
            emit(["error": "Expected {\"system\":\"...\"}"])
            return
        }

        let session = LanguageModelSession {
            systemPrompt
        }
        emit(["ready": true])

        while let turn = readJSONLine() {
            guard let userMessage = turn["user"] as? String else { continue }
            var previousText = ""
            let stream = session.streamResponse(to: userMessage)
            for try await snapshot in stream {
                let fullText = snapshot.content
                let delta = String(fullText.dropFirst(previousText.count))
                previousText = fullText
                if !delta.isEmpty {
                    emit(["token": delta])
                }
            }
            emit(["done": true])
        }
    }
}

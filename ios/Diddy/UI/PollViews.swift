import SwiftUI

/// The SDK's poll timeline item already folds in edits, responses, encryption and end events.
struct PollCard: View {
    let poll: PollSnapshot
    let onVote: ([String]) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(poll.question).font(.headline).foregroundStyle(Theme.text)
            Text(poll.ended ? "Ended" : poll.maxSelections > 1 ? "Select up to \(poll.maxSelections)" : "Select one answer")
                .font(.caption).foregroundStyle(Theme.muted)
            ForEach(poll.answers, id: \.id) { answer in
                let chosen = poll.mine.contains(answer.id)
                let count = poll.votes[answer.id]?.count ?? 0
                Button {
                    var next = poll.mine
                    if poll.maxSelections == 1 { next = [answer.id] }
                    else if chosen { next.removeAll { $0 == answer.id } }
                    else if next.count < poll.maxSelections { next.append(answer.id) }
                    else { return }
                    onVote(next)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: chosen ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(chosen ? Theme.accent : Theme.muted)
                        Text(answer.text).frame(maxWidth: .infinity, alignment: .leading)
                        if poll.showResults {
                            Text("\(count) · \(poll.voters == 0 ? 0 : count * 100 / poll.voters)%")
                                .font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    .foregroundStyle(Theme.text)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 9).fill(chosen ? Theme.accent.opacity(0.18) : Theme.elevated))
                }
                .buttonStyle(.plain)
                .disabled(poll.ended)
                .accessibilityLabel("\(answer.text)\(chosen ? ", selected" : "")\(poll.showResults ? ", \(count) votes" : "")")
            }
            Text("\(poll.voters) \(poll.voters == 1 ? "vote" : "votes")\(poll.showResults ? "" : " · Results after the poll ends")")
                .font(.caption).foregroundStyle(Theme.muted)
        }
        .padding(12)
        .frame(maxWidth: 420, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.elevated.opacity(0.6)))
    }
}

struct PollComposer: View {
    let onCreate: (String, [String], Int, Bool) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var question = ""
    @State private var answers = ["", ""]
    @State private var disclosed = true
    @State private var maxSelections = 1
    @State private var error: String?
    @State private var sending = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Question") {
                    TextField("Your question", text: $question).textInputAutocapitalization(.sentences)
                        .onChange(of: question) { value in if value.count > 340 { question = String(value.prefix(340)) } }
                }
                Section("Answers (2–20)") {
                    ForEach(answers.indices, id: \.self) { index in
                        HStack {
                            TextField("Answer \(index + 1)", text: $answers[index])
                                .onChange(of: answers[index]) { value in
                                    if value.count > 340 { answers[index] = String(value.prefix(340)) }
                                }
                            if answers.count > 2 {
                                Button { answers.remove(at: index) } label: { Image(systemName: "minus.circle") }
                                    .accessibilityLabel("Remove answer \(index + 1)")
                            }
                        }
                    }
                    if answers.count < 20 {
                        Button { answers.append("") } label: { Label("Add answer", systemImage: "plus.circle") }
                    }
                }
                Section("Settings") {
                    Toggle("Show results while open", isOn: $disclosed)
                    Stepper("Maximum selections: \(maxSelections)", value: $maxSelections,
                            in: 1...max(1, answers.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count))
                }
                if let error { Text(error).foregroundStyle(Theme.danger) }
            }
            .navigationTitle("Poll")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
                        let valid = answers.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                        guard !q.isEmpty, valid.count >= 2, Set(valid.map { $0.lowercased() }).count == valid.count else {
                            error = "Enter a question and at least two different answers."
                            return
                        }
                        sending = true
                        Task {
                            if await onCreate(q, valid, min(maxSelections, valid.count), disclosed) {
                                dismiss()
                            } else {
                                error = "Could not send the poll. Please try again."
                                sending = false
                            }
                        }
                    }.disabled(sending)
                }
            }
        }
    }
}

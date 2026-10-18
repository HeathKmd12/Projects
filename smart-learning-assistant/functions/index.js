const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')

initializeApp()
const db = getFirestore()
const huggingFaceToken = defineSecret('HF_TOKEN')

exports.askAssistant = onCall({ secrets: [huggingFaceToken], timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to use the AI assistant.')
  const message = String(request.data?.message || '').trim()
  const subject = String(request.data?.subject || 'General').trim() || 'General'
  if (!message || message.length > 1500) throw new HttpsError('invalid-argument', 'Messages must contain between 1 and 1,500 characters.')
  if (subject.length > 100) throw new HttpsError('invalid-argument', 'Invalid subject.')
  const uid = request.auth.uid, now = Timestamp.now(), usageRef = db.collection('aiUsage').doc(uid)
  await db.runTransaction(async (transaction) => {
    const usage = await transaction.get(usageRef), data = usage.exists ? usage.data() : {}
    const today = new Date().toISOString().slice(0, 10), sameDay = data.day === today
    const dailyCount = sameDay ? Number(data.dailyCount || 0) : 0
    const minuteStart = data.minuteStart?.toMillis?.() || 0
    const sameMinute = now.toMillis() - minuteStart < 60000
    const minuteCount = sameMinute ? Number(data.minuteCount || 0) : 0
    if (dailyCount >= 50) throw new HttpsError('resource-exhausted', 'You have reached todayâ€™s AI assistance limit.')
    if (minuteCount >= 8) throw new HttpsError('resource-exhausted', 'Please wait a minute before sending more AI requests.')
    transaction.set(usageRef, { day: today, dailyCount: dailyCount + 1, minuteStart: sameMinute ? data.minuteStart : now, minuteCount: minuteCount + 1, updatedAt: now }, { merge: true })
  })
  const prompt = `You are Smart Learning Assistant, a supportive tertiary education tutor. Answer clearly, accurately, and concisely. Subject: ${subject}. Student question: ${message}`
  let response
  try {
    response = await fetch('https://api-inference.huggingface.co/models/google/flan-t5-large', { method: 'POST', headers: { Authorization: `Bearer ${huggingFaceToken.value()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 350, return_full_text: false } }) })
  } catch { throw new HttpsError('unavailable', 'The AI service is temporarily unavailable. Please try again.') }
  if (!response.ok) throw new HttpsError('unavailable', 'The AI service is temporarily unavailable. Please try again.')
  const payload = await response.json()
  const reply = String(Array.isArray(payload) ? payload[0]?.generated_text : payload?.generated_text || '').trim()
  if (!reply) throw new HttpsError('unavailable', 'The AI service returned an empty response. Please try again.')
  await db.collection('users').doc(uid).collection('conversations').add({ subject, userMessage: message, assistantMessage: reply.slice(0, 6000), createdAt: FieldValue.serverTimestamp() })
  return { reply }
})

exports.startQuiz = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to start a quiz.')
  const quizId = String(request.data?.quizId || '')
  if (!quizId) throw new HttpsError('invalid-argument', 'Invalid quiz.')
  const quiz = await db.collection('quizzes').doc(quizId).get()
  if (!quiz.exists || quiz.data().active === false) throw new HttpsError('not-found', 'This quiz is unavailable.')
  const questions = await quiz.ref.collection('questions').orderBy('createdAt').get()
  if (questions.empty) throw new HttpsError('failed-precondition', 'This quiz has no questions yet.')
  const minutes = Math.max(1, Math.min(Number(quiz.data().durationMinutes || 15), 180))
  const now = Timestamp.now(), expiresAt = Timestamp.fromMillis(now.toMillis() + minutes * 60000)
  const attempt = db.collection('quizAttempts').doc()
  await attempt.set({ userId: request.auth.uid, quizId, startedAt: now, expiresAt, completed: false, questionIds: questions.docs.map((item) => item.id) })
  return { attemptId: attempt.id, expiresAt: expiresAt.toMillis(), quiz: { id: quiz.id, title: quiz.data().title, subject: quiz.data().subject || 'General' }, questions: questions.docs.map((item) => ({ id: item.id, text: item.data().text, options: item.data().options, marks: item.data().marks || 1 })) }
})

exports.submitQuiz = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to submit a quiz.')
  const attemptId = String(request.data?.attemptId || ''), answers = request.data?.answers
  if (!attemptId || !answers || typeof answers !== 'object') throw new HttpsError('invalid-argument', 'Invalid quiz submission.')
  const attemptRef = db.collection('quizAttempts').doc(attemptId)
  const result = await db.runTransaction(async (transaction) => {
    const attempt = await transaction.get(attemptRef)
    if (!attempt.exists || attempt.data().userId !== request.auth.uid || attempt.data().completed) throw new HttpsError('failed-precondition', 'This quiz attempt is invalid or already submitted.')
    if (Timestamp.now().toMillis() > attempt.data().expiresAt.toMillis()) throw new HttpsError('deadline-exceeded', 'The quiz time has expired.')
    const quiz = await transaction.get(db.collection('quizzes').doc(attempt.data().quizId))
    const questions = await Promise.all(attempt.data().questionIds.map((id) => transaction.get(quiz.ref.collection('questions').doc(id))))
    let earned = 0, total = 0, correct = 0
    questions.forEach((question) => { const data = question.data(); const marks = Number(data.marks || 1); total += marks; if (Number(answers[question.id]) === Number(data.correctIndex)) { earned += marks; correct++ } })
    const score = total ? Math.round((earned / total) * 100) : 0
    const studentAttempt = db.collection('users').doc(request.auth.uid).collection('quizAttempts').doc(attemptId)
    transaction.set(studentAttempt, { quizId: quiz.id, title: quiz.data().title, subject: quiz.data().subject || 'General', score, correctAnswers: correct, totalQuestions: questions.length, submittedAt: FieldValue.serverTimestamp() })
    transaction.update(attemptRef, { completed: true, submittedAt: FieldValue.serverTimestamp(), score })
    return { score, correctAnswers: correct, totalQuestions: questions.length, title: quiz.data().title }
  })
  return result
})


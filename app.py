from flask import Flask, render_template, request, jsonify, send_file
from rag_pipeline import load_docs, create_vector_store, ask_question, extract_key_points
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
from io import BytesIO
import os
import uuid

app = Flask(__name__)
chat_history = []
vector_store = None
documents = []
UPLOAD_FOLDER = "uploads"

# Ensure upload folder exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/upload', methods=['POST'])
def upload():
    global documents, vector_store, chat_history

    file = request.files['file']

    # Generate a unique filename or folder
    session_id = str(uuid.uuid4())
    session_folder = os.path.join(UPLOAD_FOLDER, session_id)
    os.makedirs(session_folder, exist_ok=True)

    file_path = os.path.join(session_folder, file.filename)
    file.save(file_path)

    print("🔄 Loaded new document at:", file_path)

    # Clear previous session state
    documents = []
    vector_store = None
    chat_history = []

    # Load new document
    documents = load_docs(file_path)
    vector_store = create_vector_store(documents)

    return jsonify({'message': 'Document uploaded successfully.'})

@app.route('/extract', methods=['GET'])
def extract():
    global documents
    if not documents:
        return "No document uploaded yet.", 400
    summary_points = extract_key_points(documents)
    return jsonify(summary_points)

@app.route('/ask', methods=['POST'])
def ask():
    global vector_store
    question = request.form['question']
    if not vector_store:
        return jsonify({'answer': "Please upload a document first."})
    answer = ask_question(vector_store, question)
    return jsonify({'answer': answer})

# Register custom font
pdfmetrics.registerFont(TTFont('DejaVu', 'fonts/DejaVuSans.ttf'))

@app.route('/download_pdf', methods=['POST'])
def download_pdf():
    data = request.get_json()
    points = data.get("points", [])

    buffer = BytesIO()

    doc = SimpleDocTemplate(buffer, pagesize=A4,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=40)

    bullet_style = ParagraphStyle(
        name='BulletStyle',
        fontName='DejaVu',
        fontSize=11,
        leading=12,
        leftIndent=8,
        firstLineIndent=-8,
        spaceAfter=4,
        alignment=TA_LEFT
    )

    content = []
    for point in points:
        if point.strip():
            para = Paragraph(f'• {point}', bullet_style)
            content.append(para)
            content.append(Spacer(1, 8))

    doc.build(content)
    buffer.seek(0)

    return send_file(buffer, as_attachment=True,
                     download_name="extracted_summary.pdf",
                     mimetype='application/pdf')

if __name__ == '__main__':
    app.run(debug=True)

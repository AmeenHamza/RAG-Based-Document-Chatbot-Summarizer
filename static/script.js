
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}



let recognition;
let selectedVoiceHindi = null;
let selectedVoiceEnglish = null;
let finalTranscript = "";
let isSpeaking = false;  // 👈 Ye batayega ke bol raha hai ya nahi


let voicesLoaded = false;

window.speechSynthesis.onvoiceschanged = () => {
    const voices = speechSynthesis.getVoices();
    selectedVoiceHindi = voices.find(v => v.name.includes("हिन्दी")) || voices.find(v => v.lang === "en-IN") || null;
    voicesLoaded = true;
};

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = function () {
        document.getElementById("voiceControls").style.display = "flex";
        const questionInput = document.getElementById("question");
        questionInput.classList.add("listening");
        questionInput.placeholder = "";

        document.getElementById("listeningAnim").style.display = "inline";
        startDotAnimation();
        finalTranscript = "";
    };

    recognition.onresult = function (event) {
        let tempTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + " ";
            } else {
                tempTranscript += event.results[i][0].transcript;
            }
        }
    };

    recognition.onerror = function (event) {
        alert("🎤 Error during voice input: " + event.error);
    };

    recognition.onend = () => {
        document.querySelector('.fa-microphone')?.classList.remove('text-danger');
    };
}

let dotInterval;
function startDotAnimation() {
    const dotsPart = document.getElementById("listeningDots");
    let dots = "";
    dotInterval = setInterval(() => {
        dots = dots.length < 5 ? dots + "." : "";
        dotsPart.textContent = dots;
    }, 500);
}

function startVoiceInput() {
    if (recognition) {
        document.querySelector('.fa-microphone')?.classList.add('text-danger');
        recognition.start();
    } else {
        alert("Voice recognition not supported in your browser.");
    }
}

function confirmVoiceInput() {
    recognition?.stop();
    document.getElementById("voiceControls").style.display = "none";

    const questionInput = document.getElementById("question");
    questionInput.classList.remove("listening");
    questionInput.placeholder = "Ask something...";
    questionInput.value = finalTranscript.trim();

    clearInterval(dotInterval);
    document.getElementById("listeningAnim").style.display = "none";
    document.getElementById("listeningDots").textContent = "";
}

function cancelVoiceInput() {
    recognition?.stop();
    document.getElementById("voiceControls").style.display = "none";

    const questionInput = document.getElementById("question");
    questionInput.value = "";
    questionInput.classList.remove("listening");
    questionInput.placeholder = "Ask something...";
    finalTranscript = "";

    clearInterval(dotInterval);
    document.getElementById("listeningAnim").style.display = "none";
    document.getElementById("listeningDots").textContent = "";
}


function speak(text) {
    if (!voicesLoaded) {
        console.warn("Voices not loaded yet!");
        return;
    }

    if (isSpeaking) {
        // 👈 Agar already speaking hai, to cancel kar do
        speechSynthesis.cancel();
        isSpeaking = false;
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoiceHindi) {
        utterance.voice = selectedVoiceHindi;
        utterance.lang = "en-IN";
    }

    utterance.onend = () => {
        isSpeaking = false;
    };

    speechSynthesis.speak(utterance);
    isSpeaking = true;
}


function goBack() {
    $('#main-content').fadeOut();
    $('#Application-feature').fadeIn();
}
function goForward() {
    $('#main-content').fadeIn();
    $('#Application-feature').fadeOut();
}

// 🌙 Toggle Dark Mode
function toggleDarkMode() {
    $('body').toggleClass('dark-mode');
}

$(document).ready(function () {
    let extractedContent = [];
    let summaryContent = [];
    let currentChatId = null;

    const showSpinner = (text = "Loading...") => {
        return `<div class="spinner-box">
                        <div class="spinner-border text-primary me-2" role="status" style="width: 1.5rem; height: 1.5rem;">
                            <span class="visually-hidden">Loading...</span>
                        </div> ${text}
                    </div>`;
    };



    // 📊 Upload Progress Bar
    $('#uploadForm').off().submit(function (e) {
        e.preventDefault();
        $('#upload-status').html(showSpinner("Uploading..."));
        $('#chatForm button').prop('disabled', true);
        $('#progress-bar-container').show();
        $('#progress-bar').css('width', '0%');

        const fileInput = $(this).find('input[type="file"]')[0];
        const allowedTypes = ['application/pdf', 'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'];

        if (!fileInput.files.length || !allowedTypes.includes(fileInput.files[0].type)) {
            $('#upload-status').removeClass('text-success').addClass('text-danger')
                .html("❌ Unsupported file format. Please upload PDF, TXT, DOCX, CSV, or XLSX.");
            $('#chatForm button').prop('disabled', false);
            $('#progress-bar-container').hide();
            return;
        }

        const formData = new FormData(this);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/upload", true);

        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                $('#progress-bar').css('width', percent + '%');
            }
        };

        xhr.onload = function () {
            $('#progress-bar-container').hide();
            $('#progress-bar').css('width', '0%');

            if (xhr.status === 200) {
                const res = JSON.parse(xhr.responseText);
                $('#upload-status').html('<span class="text-success">✅ ' + (res.message || 'Document uploaded successfully.') + '</span>');
                $('#extracted-text, #summary-box').empty();
                $('#chat-box').empty();
                $('#downloadBtn, #downloadSummaryBtn').addClass('d-none');
                $('#chatForm button').prop('disabled', false);
                $('#main-content').fadeIn();
                $('#Application-feature').fadeOut();

                fetch('/get_chats')
                    .then(r => r.json())
                    .then(data => {
                        if (data.length > 0) {
                            currentChatId = data[0].chat_id; // Set latest or first chat
                            loadChats(); // Refresh sidebar/chat list
                        }
                    });

                fetch('/preview')
                    .then(res => res.json())
                    .then(data => {
                        if (data.text) {
                            let paragraphs = data.text.split('\n\n');
                            let html = paragraphs.map(p => `<div class="doc-paragraph">${p}</div>`).join("");
                            $('#document-preview').html(html);
                        } else {
                            $('#document-preview').html("❌ No preview text found.");
                        }
                    })
                    .catch(err => {
                        console.error(err);
                        $('#document-preview').html("❌ Error loading preview.");
                    });
            } else {
                $('#upload-status').html("❌ Failed to upload document.");
            }
        };

        xhr.onerror = function () {
            $('#upload-status').html("❌ Upload error.");
            $('#progress-bar-container').hide();
        };

        xhr.send(formData);
    });

    $('#fileElem').on('change', function () {
        const file = this.files[0];
        if (file) {
            $('#fileName').text(`${file.name}`);
        } else {
            $('#fileName').text('');
        }
    });


    // ✨ Animate Chat Bot Response
    function typeBotResponse(msg, callback) {
        let i = 0;
        let speed = 20;
        const msgId = `msg-${Date.now()}`;
        let container = $(`
        <div class="bot-msg bot-response" id="${msgId}">
            <strong>Bot:</strong> <span class="bot-text"></span>
            <button class="btn btn-sm btn-link text-primary ms-2 speak-btn" title="Read aloud">
                <i class="fas fa-volume-up"></i>
            </button>
        </div>`);

        $('#chat-box').append(container);
        let target = container.find('.bot-text');

        function type() {
            if (i < msg.length) {
                target.append(msg.charAt(i));
                i++;
                setTimeout(type, speed);
            } else {
                container.find('.speak-btn').on('click', function () {
                    speak(msg);
                });
                if (callback) callback();
            }
            $('#chat-box').scrollTop($('#chat-box')[0].scrollHeight);
        }

        type();
    }


    $('#extractBtn').click(function () {
        $('#extracted-text').html(showSpinner("Extracting clauses..."));
        $('#downloadBtn').addClass('d-none');

        $.get('/extract', function (res) {
            let html = "<ul>";
            extractedContent = [];

            res.forEach(function (item) {
                html += "<li>" + item + "</li>";
                extractedContent.push(item);
            });

            html += "</ul>";
            $('#extracted-text').html(html);
            $('#downloadBtn').removeClass('d-none');
        }).fail(function () {
            $('#extracted-text').html("❌ Extraction failed. Upload a document first.");
        });
    });

    $('#summarizeBtn').click(function () {
        $('#summary-box').html(showSpinner("Summarizing..."));
        $('#downloadSummaryBtn').addClass('d-none');

        $.get('/summarize', function (res) {
            let html = "<ul>";
            summaryContent = [];

            res.forEach(function (item) {
                html += "<li>" + item + "</li>";
                summaryContent.push(item);
            });

            html += "</ul>";
            $('#summary-box').html(html);
            $('#downloadSummaryBtn').removeClass('d-none');
        }).fail(function () {
            $('#summary-box').html("❌ Summary failed. Upload a document first.");
        });
    });



    document.getElementById("new-chat-btn").addEventListener("click", () => {
        fetch("/create_chat", { method: "POST" })
            .then(res => res.json())
            .then(data => {
                const { chat_id, title } = data;
                currentChatId = chat_id; // ✅ Set current chat ID
                loadChats();             // ✅ Refresh chat list
                // Optionally: clear the chat UI
                document.getElementById("chat-box").innerHTML = "";
            });

    });

function loadChats() {
    fetch("/get_chats")
        .then(res => res.json())
        .then(chats => {
            const list = document.getElementById("chat-history-list");
            list.innerHTML = "";

            chats.forEach(chat => {
                const li = document.createElement("li");
                li.className = "list-group-item d-flex justify-content-between align-items-center";
                li.id = `chat-${chat.chat_id}`;
                li.setAttribute("data-id", chat.chat_id);
                li.style.cursor = "pointer";

                // ✅ Highlight selected chat
                if (chat.chat_id === currentChatId) {
                    li.classList.add("active-chat");
                }

                const titleSpan = document.createElement("span");
                titleSpan.className = "chat-title";
                titleSpan.innerText = chat.title;
                titleSpan.style.flex = "1";

                titleSpan.onclick = () => {
                    currentChatId = chat.chat_id;

                    // ✅ Remove highlight from all items first
                    document.querySelectorAll("#chat-history-list .list-group-item")
                        .forEach(item => item.classList.remove("active-chat"));

                    // ✅ Add highlight to current
                    li.classList.add("active-chat");

                    loadChatHistory(chat.chat_id);
                };

                const dotsBtn = document.createElement("button");
                dotsBtn.className = "btn btn-sm btn-light";
                dotsBtn.innerHTML = "⋮";
                dotsBtn.style.marginLeft = "5px";
                dotsBtn.onclick = (e) => {
                    e.stopPropagation();
                    showDropdownMenu(e.target, chat.chat_id, titleSpan);
                };

                const actionsDiv = document.createElement("div");
                actionsDiv.className = "d-flex align-items-center";
                actionsDiv.appendChild(dotsBtn);

                li.appendChild(titleSpan);
                li.appendChild(actionsDiv);
                list.appendChild(li);
            });
        });
}



    function showDropdownMenu(targetBtn, chatId, titleSpan) {
        const existingDropdown = document.getElementById("dropdown-menu");
        if (existingDropdown) existingDropdown.remove();

        const dropdown = document.createElement("div");
        dropdown.id = "dropdown-menu";
        dropdown.className = "position-absolute bg-white border rounded shadow-sm";
        dropdown.style.minWidth = "120px";
        dropdown.style.zIndex = "9999";
        dropdown.innerHTML = `
        <div id="chat-dropdown" class="dropdown-item p-2" style="cursor: pointer;">✏️ Rename</div>
        <div id="chat-dropdown" class="dropdown-item p-2 text-danger" style="cursor: pointer;">🗑️ Delete</div>
    `;

        document.body.appendChild(dropdown);

        const rect = targetBtn.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + window.scrollY}px`;
        dropdown.style.left = `${rect.left + window.scrollX}px`;

        const [renameBtn, deleteBtn] = dropdown.querySelectorAll(".dropdown-item");

        renameBtn.onclick = (e) => {
            e.stopPropagation();
            dropdown.remove();
            enableRename(titleSpan, chatId);
        };

        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            dropdown.remove();
            deleteChat(chatId);
        };

        // Click outside to close
        document.addEventListener("click", function closeDropdown(e) {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener("click", closeDropdown);
            }
        });
    }

    function deleteChat(chatId) {
        console.log("🟢 deleteChat triggered for ID:", chatId);
        Swal.fire({
            title: "Delete this chat?",
            text: "This action cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Yes, delete it!"
        }).then((result) => {
            if (result.isConfirmed) {
                fetch(`/chat/${chatId}`, { method: 'DELETE' })
                    .then(res => {
                        if (res.ok) {
                            document.getElementById(`chat-${chatId}`).remove();
                        } else {
                            console.error("❌ Failed to delete:", res.status);
                        }
                    })
                    .catch(err => console.error("❌ Fetch error:", err));
            }
        });
    }


    function enableRename(titleSpan, chatId) {
        const originalTitle = titleSpan.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalTitle;
        input.className = 'rename-input';

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const newTitle = input.value.trim();
                if (newTitle && newTitle !== originalTitle) {
                    const res = await fetch(`/chat/${chatId}/rename`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newTitle }) // ✅ use "newTitle"
                    });
                    if (res.ok) {
                        titleSpan.textContent = newTitle;
                    }
                }
                titleSpan.style.display = '';
                input.remove();
            } else if (e.key === 'Escape') {
                titleSpan.style.display = '';
                input.remove();
            }
        });

        input.addEventListener('blur', () => {
            titleSpan.style.display = '';
            input.remove();
        });

        titleSpan.style.display = 'none';
        titleSpan.parentNode.insertBefore(input, titleSpan);
        input.focus();
    }



    function loadChatHistory(chatId) {
        fetch(`/chat/${chatId}/history`)
            .then(res => res.json())
            .then(messages => {
                const box = document.getElementById("chat-box");
                box.innerHTML = "";
                messages.forEach(msg => {
                    if (msg.role === "user") {
                        const userDiv = document.createElement("div");
                        userDiv.className = "user-msg";
                        userDiv.innerHTML = `<strong>You:</strong> ${msg.text}`;
                        box.appendChild(userDiv);
                    } else if (msg.role === "bot") {
                        // Use same animation and speak button
                        displayBotMessage(msg.text);
                    }
                });

            });
    }


    // Override chat submit to use animation
    $('#chatForm').off().submit(function (e) {
        e.preventDefault();
        const question = $('#question').val();
        $('#chat-box').append(`<div class='user-msg'><strong>You:</strong> ${question}</div>`);
        $('#chat-box').append(`<div class='bot-msg' id='bot-loading'>${showSpinner("Thinking...")}</div>`);
        $('#question').val('');

        $.post(`/chat/${currentChatId}/ask`, { question: question }, function (res) {
            $('#bot-loading').remove();
            typeBotResponse(res.answer);
        }).fail(function () {
            $('#bot-loading').remove();
            $('#chat-box').append(`<div class='bot-msg'><strong>Bot:</strong> Something went wrong.</div>`);
        });

    });

    // Load chats on page load
    window.onload = loadChats;



    $('#downloadBtn').click(function () {
        if (extractedContent.length === 0) {
            alert("No content to download.");
            return;
        }

        fetch('/download_pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: extractedContent })
        }).then(res => {
            if (!res.ok) throw new Error("Failed to generate PDF");
            return res.blob();
        }).then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'extracted_clauses.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
        }).catch(err => alert("Error: " + err.message));
    });

    $('#downloadSummaryBtn').click(function () {
        if (summaryContent.length === 0) {
            alert("No summary to download.");
            return;
        }

        fetch('/download_summary_pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: summaryContent })
        }).then(res => {
            if (!res.ok) throw new Error("Failed to generate summary PDF");
            return res.blob();
        }).then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Summary.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
        }).catch(err => alert("Error: " + err.message));
    });
});

function displayBotMessage(msg) {
    const container = $(`
        <div class="bot-msg bot-response">
            <strong>Bot:</strong> <span class="bot-text">${msg}</span>
            <button class="btn btn-sm btn-link text-primary ms-2 speak-btn" title="Read aloud">
                <i class="fas fa-volume-up"></i>
            </button>
        </div>`);

    $('#chat-box').append(container);

    const speakBtn = container.find('.speak-btn');
    const icon = speakBtn.find('i');

    let thisUtterance = null;
    let isSpeakingThis = false;

    speakBtn.on('click', function () {
        if (!voicesLoaded) {
            console.warn("Voices not loaded yet!");
            return;
        }

        if (!isSpeakingThis) {
            // Start speaking with correct voice/lang
            thisUtterance = new SpeechSynthesisUtterance(msg);
            thisUtterance.voice = selectedVoiceHindi;
            thisUtterance.lang = "en-IN";

            thisUtterance.onend = () => {
                icon.removeClass('fa-volume-mute').addClass('fa-volume-up');
                isSpeakingThis = false;
            };

            icon.removeClass('fa-volume-up').addClass('fa-volume-mute');
            speechSynthesis.speak(thisUtterance);
            isSpeakingThis = true;
        } else {
            // Stop speaking
            speechSynthesis.cancel();
            icon.removeClass('fa-volume-mute').addClass('fa-volume-up');
            isSpeakingThis = false;
        }
    });
}


// Drag-and-Drop File Upload Handling
let dropArea = document.getElementById('drop-area');
let fileInput = document.getElementById('fileElem');

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
    }, false);
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        document.getElementById('fileName').textContent = `📄 ${fileInput.files[0].name}`;
    }
});
z
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        document.getElementById('fileName').textContent = `📄 ${fileInput.files[0].name}`;
    }
});

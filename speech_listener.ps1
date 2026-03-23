Add-Type -AssemblyName System.Speech
$recognition = New-Object System.Speech.Recognition.SpeechRecognitionEngine

# Configure the wake words
$choices = New-Object System.Speech.Recognition.Choices
$choices.Add("Jarvis")
$choices.Add("Jarvis wake up")
$choices.Add("Jarvis wake up daddys home")
$choices.Add("Jarvis uth jao")
$choices.Add("Service wake up")
$choices.Add("Travis wake up")

$builder = New-Object System.Speech.Recognition.GrammarBuilder
$builder.Append($choices)
$grammar = New-Object System.Speech.Recognition.Grammar($builder)

$recognition.LoadGrammar($grammar)
$recognition.SetInputToDefaultAudioDevice()

# Event Handler
$action = {
    $result = $EventArgs.Result.Text
    Write-Host "WAKE_DETECTED:$result"
}

Register-ObjectEvent -InputObject $recognition -EventName "SpeechRecognized" -Action $action | Out-Null

$recognition.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

Write-Host "SPEECH_LISTENER_STARTED"

# Keep alive
while($true) { Start-Sleep -Seconds 1 }

import { useEffect, useState } from "react";
import { Alert, ScrollView, View, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import * as FileSystem from "expo-file-system";
import { Tags } from "../../components/Tags";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Header } from "../../components/Header";
import { Button } from "../../components/Button";
import { TextArea } from "../../components/TextArea";
import { ButtonIcon } from "../../components/ButtonIcon";
import { styles } from "./styles";
import { Toast } from "../../components/Toast";
import React from "react";

const RECORDING_OPTIONS = {
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  ios: {
    extension: ".wav",
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

export function Details() {
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConvertingSpeechToText, setIsConvertingSpeechToText] =
    useState(false);
  const [description, setDescription] = useState("");
  const [collectionName, setCollectionName] = useState("Tags");
  const [isModalFormVisible, setIsModalFormVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const authorization = `Bearer ${process.env.OPENAI_API_KEY}`;

  async function handleFetchTags() {
    setIsLoading(true);
    const prompt = `
      Generate keywords in Portuguese for a post about ${description.trim()}.       
      Replace the spaces in each word with the character "_".
      Return each item separated by a comma, in lowercase, and without a line break.
    `;

    fetch(
      "https://api.openai.com/v1/engines/text-davinci-003-playground/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization,
        },
        body: JSON.stringify({
          prompt,
          temperature: 0.22,
          max_tokens: 500,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
        }),
      }
    )
      .then((response) => response.json())
      .then((data) => {
        console.log({ data });
        saveTags(data.choices[0].text);
      })
      .catch((error) =>
        Alert.alert(`Erro", "Não foi possível buscar as tags. ${error}`)
      )
      .finally(() => setIsLoading(false));
  }

  function saveTags(data: string) {
    const tagsFormatted = data
      .trim()
      .split(",")
      .map((tag) => `#${tag}`);

    setTags(tagsFormatted);
  }

  function handleNameCollectionEdit() {
    setIsModalFormVisible(false);
  }

  async function handleRecordingStart() {
    const { granted } = await Audio.getPermissionsAsync();

    const recording = new Audio.Recording();
    if (granted) {
      try {
        setToastMessage("Gravando...");
        await recording.prepareToRecordAsync(RECORDING_OPTIONS);
        await recording.startAsync();
        setRecording(recording);
      } catch (error) {
        console.log(error);
      }
    }
  }

  async function handleRecordingStop() {
    try {
      setToastMessage(null);
      await recording?.stopAndUnloadAsync();
      const recordingFileUri = recording?.getURI();
      if (recordingFileUri) {
        const filename = recordingFileUri.split("/").pop();

        await getTranscription(recordingFileUri, filename);

        await FileSystem.deleteAsync(recordingFileUri);

        setRecording(null);
      } else {
        Alert.alert("Audio", "Não foi possível obter a gravação.");
      }
    } catch (error) {
      console.log(error);
    }
  }

  async function getTranscription(file: string, fileName: string) {
    setIsConvertingSpeechToText(true);

    const formData = new FormData();
    const typeByPlatform = Platform.OS === "android" ? "m4a" : "wav";
    formData.append("file", {
      uri: file,
      type: `audio/${typeByPlatform}`,
      name: fileName,
    });
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data",
        authorization,
      },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        setDescription(data?.text);
      })
      .catch((error) => console.error(error))
      .finally(() => setIsConvertingSpeechToText(false));
  }

  useEffect(() => {
    Audio.requestPermissionsAsync().then((granted) => {
      if (granted) {
        Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          playThroughEarpieceAndroid: true,
        });
      }
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {toastMessage && <Toast message={toastMessage} />}

      <Header title={collectionName}>
        <ButtonIcon
          iconName="edit"
          onPress={() => setIsModalFormVisible(true)}
        />
      </Header>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <TextArea
            placeholder="Sobre qual assunto você deseja gerar tags?"
            onChangeText={setDescription}
            value={description}
            onClear={() => setDescription("")}
            editable={!isLoading}
          />

          <View style={styles.options}>
            <Button
              title="Gerar tags"
              onPress={handleFetchTags}
              isLoading={isLoading}
            />

            <ButtonIcon
              iconName="mic"
              size="secondary_size"
              onPressIn={handleRecordingStart}
              onPressOut={handleRecordingStop}
              isLoading={isConvertingSpeechToText}
            />
          </View>
        </View>

        <Tags tags={tags} setTags={setTags} />
      </ScrollView>

      <Modal
        visible={isModalFormVisible}
        onClose={() => setIsModalFormVisible(false)}
        title="Editar nome"
      >
        <>
          <Input
            placeholder="Nome da coleção"
            onChangeText={setCollectionName}
            value={collectionName}
          />

          <Button title="Salvar" onPress={handleNameCollectionEdit} />
        </>
      </Modal>
    </SafeAreaView>
  );
}

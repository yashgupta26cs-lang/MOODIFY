"""Starter music catalogue for MOODIFY.

Audio is streamed from Wikimedia Commons. Keep the source and licence
credits visible in the player whenever a track is used.
"""

CATALOG_TRACKS = [
    {
        "id": 9001,
        "slug": "air-on-the-g-string",
        "title": "Air on the G String",
        "artist": "Joel Belov & Robert Gayler",
        "composer": "Johann Sebastian Bach",
        "language": "Instrumental",
        "mood": "Calm",
        "genre": "Classical",
        "duration": "4:20",
        "description": "A gentle 1920 violin-and-piano recording of Bach's much-loved Air.",
        "audio_url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/1/1e/Air_%28Bach%29.ogg/Air_%28Bach%29.ogg.mp3",
        "fallback_audio_url": "https://upload.wikimedia.org/wikipedia/commons/1/1e/Air_%28Bach%29.ogg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Air_(Bach).ogg",
        "license_label": "Public Domain Mark 1.0",
        "license_url": "https://creativecommons.org/publicdomain/mark/1.0/",
        "credit": "1920 recording: violin solo by Joel Belov with piano accompaniment by Robert Gayler. Source: Wikimedia Commons.",
        "art_class": "air",
        "art_mark": "AIR",
    },
    {
        "id": 9002,
        "slug": "moonlight-sonata",
        "title": "Moonlight Sonata",
        "artist": "Ludwig van Beethoven",
        "composer": "Ludwig van Beethoven",
        "language": "Instrumental",
        "mood": "Reflective",
        "genre": "Classical",
        "duration": "5:07",
        "description": "The first movement of Beethoven's Sonata No. 14, a quiet piano piece.",
        "audio_url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/d0/Moonlight_Sonata.ogg/Moonlight_Sonata.ogg.mp3",
        "fallback_audio_url": "https://upload.wikimedia.org/wikipedia/commons/d/d0/Moonlight_Sonata.ogg",
        "source_url": "https://commons.wikimedia.org/wiki/File:Moonlight_Sonata.ogg",
        "license_label": "Public Domain Mark 1.0",
        "license_url": "https://creativecommons.org/publicdomain/mark/1.0/",
        "credit": "Audio rendition sourced from a public-domain Mutopia score (Berners, 1908; edited by A. Winterberger). Source: Wikimedia Commons.",
        "art_class": "moonlight",
        "art_mark": "MOON",
    },
]

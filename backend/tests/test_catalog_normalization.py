import unittest

from backend.services.get_price import normalize_service


def service(**overrides):
    item = {
        "category": "Test",
        "service": "10",
        "name": "Просмотры",
        "rate": "10.00",
        "currency": "RUB",
        "min": "10",
        "max": "1000",
        "soc": "instagram",
        "type": "views",
        "refill": False,
        "canceling_is_available": True,
        "description": "Описание",
    }
    item.update(overrides)
    return item


class CatalogNormalizationTests(unittest.TestCase):
    def test_uses_soc_and_type_as_primary_classification(self):
        cases = [
            ("instagram", "likes", "instagram", "likes"),
            ("instagram", "followers", "instagram", "followers"),
            ("telegram", "reaction", "telegram", "reactions"),
            ("youtube", "livestream", "youtube", "livestream"),
            ("vk", "friends", "vk", "friends"),
        ]

        for soc, provider_type, platform, service_type in cases:
            with self.subTest(soc=soc, provider_type=provider_type):
                result = normalize_service(service(soc=soc, type=provider_type))
                self.assertEqual(result["platform"], platform)
                self.assertEqual(result["service_type"], service_type)

    def test_classifies_clear_provider_other_services(self):
        cases = [
            ("instagram", "Stories - Просмотры", "stories"),
            ("instagram", "Сохранения", "saves"),
            ("telegram", "Рефералы - Другие #1", "referrals"),
            ("vk", "Прослушивания - Быстрые", "listenings"),
            ("youtube", "Репосты - Быстрые", "reposts"),
        ]

        for soc, name, service_type in cases:
            with self.subTest(soc=soc, name=name):
                result = normalize_service(service(soc=soc, type="other", name=name))
                self.assertEqual(result["service_type"], service_type)

    def test_splits_music_services_into_real_platforms(self):
        cases = [
            ("VK - Прослушивания", "vk", "listenings"),
            ("Spotify - Подписчики", "spotify", "followers"),
            ("Spotify - Подкасты", "spotify", "podcasts"),
            ("Apple Music - Прослушивания", "apple_music", "listenings"),
            ("Shazam - Прослушивания", "shazam", "listenings"),
        ]

        for name, platform, service_type in cases:
            with self.subTest(name=name):
                result = normalize_service(
                    service(soc="other", type="music", category="music", name=name)
                )
                self.assertEqual(result["platform"], platform)
                self.assertEqual(result["service_type"], service_type)

    def test_excludes_service_when_platform_cannot_be_identified(self):
        result = normalize_service(
            service(
                service="421",
                soc="other",
                type="Custom Comment",
                category="Custom Comment",
                name="Комментарии - Собственные",
            )
        )
        self.assertIsNone(result)

    def test_excludes_wibes_from_public_catalog(self):
        self.assertIsNone(
            normalize_service(service(soc="wibes", type="views"))
        )

    def test_preserves_provider_fields_and_real_service_id(self):
        result = normalize_service(
            service(
                service="178",
                soc="vk",
                type="other",
                category="VK other",
                name="Прослушивания - Быстрые",
            )
        )

        self.assertEqual(result["provider_service_id"], "178")
        self.assertEqual(result["provider_soc"], "vk")
        self.assertEqual(result["provider_type"], "other")
        self.assertEqual(result["provider_category"], "VK other")
        self.assertEqual(result["min"], "10")
        self.assertEqual(result["max"], "1000")
        self.assertEqual(result["rate"], "10.00")


if __name__ == "__main__":
    unittest.main()

<?php

namespace App\Entity;

use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\Put;
use ApiPlatform\Metadata\Post;
use Doctrine\ORM\Mapping as ORM;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\Common\Collections\ArrayCollection;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection(),
        new Post(security: "is_granted('ROLE_ADMIN')"), // Seul l'admin crée des standards
        new Put(security: "is_granted('ROLE_ADMIN')")
    ],
    normalizationContext: ['groups' => ['standard:read']],
    denormalizationContext: ['groups' => ['standard:write']]
)]
class Standard
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['standard:read', 'flock:read', 'flock:write'])]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    #[Groups(['standard:read', 'standard:write', 'flock:read'])]
    private ?string $name = null; // Ex: "Cobb 500 - Intensif", "Tilapia Niloticus"

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['standard:read', 'standard:write'])]
    private ?Speculation $speculation = null; // Lien vers Poulet ou Poisson

    /*
     * Stockage des abaques sous format JSON pour flexibilité.
     * Structure attendue :
     * [
     * { "day": 1, "weight": 42, "feed_cumulative": 12, "feed_daily": 12 },
     * { "day": 7, "weight": 180, "feed_cumulative": 150, "feed_daily": 30 },
     * ...
     * ]
     */
    #[ORM\Column(type: 'json')]
    #[Groups(['standard:read', 'standard:write', 'flock:read', 'visit:read'])] 
    private array $curveData = [];

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['standard:read', 'standard:write'])]
    private ?string $feedType = null; // Ex: "Concentré 40%", "Complet", "Flottant"

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(string $name): self
    {
        $this->name = $name;
        return $this;
    }

    public function getSpeculation(): ?Speculation
    {
        return $this->speculation;
    }

    public function setSpeculation(?Speculation $speculation): self
    {
        $this->speculation = $speculation;
        return $this;
    }

    public function getCurveData(): array
    {
        return $this->curveData;
    }

    public function setCurveData(array $curveData): self
    {
        $this->curveData = $curveData;
        return $this;
    }

    public function getFeedType(): ?string
    {
        return $this->feedType;
    }

    public function setFeedType(?string $feedType): self
    {
        $this->feedType = $feedType;
        return $this;
    }
}
<?php

namespace App\Entity;

use App\Entity\Observation;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\Post;
use Doctrine\DBAL\Types\Types;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Delete;
use Doctrine\ORM\Mapping as ORM;
use App\Repository\VisitRepository;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\OpenApi\Model\MediaType;
use ApiPlatform\OpenApi\Model\Operation;
use App\Controller\CloseVisitController;
use ApiPlatform\OpenApi\Model\RequestBody;
use App\Validator\Constraints as AppAssert;
use Doctrine\Common\Collections\Collection;
use Doctrine\Common\Collections\ArrayCollection;
use Symfony\Component\Serializer\Attribute\Groups;
use ApiPlatform\OpenApi\Model\Schema;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Doctrine\Orm\Filter\BooleanFilter;
use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use Symfony\Component\Validator\Constraints as Assert;


#[ORM\Entity(repositoryClass: VisitRepository::class)]
#[AppAssert\SequentialVisitDate]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection(),
        new Post(),
        new Patch(),
        new Delete(),
        // 👇 AJOUTEZ CETTE OPÉRATION PERSONNALISÉE
        new Patch(
            uriTemplate: '/visits/{id}/close', 
            controller: CloseVisitController::class, 
            openapi: new Operation(
                summary : 'Clôturer la visite',
                description : 'Marque la visite comme terminée et verrouille les modifications.',
                requestBody: new RequestBody(
                    content: new \ArrayObject([
                        'application/json' => new MediaType(
                            schema: new Schema()
                        )
                    ])
                )
            ),
            denormalizationContext: ['groups' => ['visit:close']], // Groupe vide pour éviter de demander des champs
            input: false, // Pas de corps JSON requis
            name: 'close_visit'
        )
    ],
    normalizationContext: ['groups' => ['visit:read']],
    denormalizationContext: ['groups' => ['visit:write']]
)]
#[ApiFilter(SearchFilter::class, properties: ['customer' => 'exact', 'technician' => 'exact'])]
#[ApiFilter(BooleanFilter::class, properties: ['closed', 'activated'])]
#[ApiFilter(DateFilter::class, properties: ['visitedAt'])]
#[ApiFilter(OrderFilter::class, properties: ['visitedAt' => 'DESC'])]
class Visit
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['visit:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['visit:read', 'visit:write'])]
    private ?User $technician = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['visit:read', 'visit:write'])]
    private ?Customer $customer = null;

    #[ORM\Column(type: Types::DATETIME_MUTABLE)]
    #[Groups(['visit:read', 'visit:write'])]
    private ?\DateTimeInterface $visitedAt = null;

    #[ORM\Column(length: 255, nullable: true)]
    #[Groups(['visit:read', 'visit:write'])]
    private ?string $gpsCoordinates = null;

    #[ORM\Column(options: ['default' => false])]
    #[Groups(['visit:read', 'visit:write'])] 
    private ?bool $closed = false;

    #[ORM\Column(options: ['default' => true])]
    #[Groups(['visit:read'])] 
    private ?bool $activated = true;

    #[ORM\OneToMany(mappedBy: 'visit', targetEntity: Observation::class, orphanRemoval: true)]
    #[Groups(['visit:read', 'visit:write'])]
    private Collection $observations;

    #[ORM\Column(type: Types::TEXT)]
    #[Groups(['visit:read', 'visit:write'])]
    #[Assert\NotBlank(message: "L'objectif principal de la visite est obligatoire.")]
    private ?string $objective = 'RAS';

    public function __construct()
    {
        $this->observations = new ArrayCollection();
        $this->visitedAt = new \DateTime();
    }

    public function getId(): ?int { return $this->id; }

    public function getTechnician(): ?User { return $this->technician; }
    public function setTechnician(?User $technician): self { $this->technician = $technician; return $this; }

    public function getCustomer(): ?Customer { return $this->customer; }
    public function setCustomer(?Customer $customer): self { $this->customer = $customer; return $this; }

    public function getVisitedAt(): ?\DateTimeInterface { return $this->visitedAt; }
    public function setVisitedAt(\DateTimeInterface $visitedAt): self { $this->visitedAt = $visitedAt; return $this; }

    public function getGpsCoordinates(): ?string { return $this->gpsCoordinates; }
    public function setGpsCoordinates(?string $gpsCoordinates): self { $this->gpsCoordinates = $gpsCoordinates; return $this; }

    public function isClosed(): ?bool { return $this->closed; }
    public function setClosed(bool $closed): self { $this->closed = $closed; return $this; }
    public function isActivated(): ?bool { return $this->activated; }
    public function setActivated(bool $activated): self { $this->activated = $activated; return $this; }

    /**
     * @return Collection<int, Observation>
     */
    public function getObservations(): Collection { return $this->observations; }

    public function addObservation(Observation $observation): self
    {
        if (!$this->observations->contains($observation)) {
            $this->observations->add($observation);
            $observation->setVisit($this);
        }
        return $this;
    }

    public function removeObservation(Observation $observation): self
    {
        if ($this->observations->removeElement($observation)) {
            if ($observation->getVisit() === $this) {
                $observation->setVisit(null);
            }
        }
        return $this;
    }

    public function getObjective(): ?string { return $this->objective; }
    public function setObjective(string $objective): self { $this->objective = $objective; return $this; }
}